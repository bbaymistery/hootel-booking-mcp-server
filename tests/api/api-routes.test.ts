import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { createExpressApp } from '../../src/api/app.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { BookingService } from '../../src/services/booking.service.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';

describe('Express REST API Endpoints Integration Tests', () => {
  const prisma = getPrismaClient();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await seedNeonRooms(prisma);

    // Clean up test bookings for 2029-08 dates
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-08-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-08-31T00:00:00.000Z') },
      },
    });

    const receiver = new SimulatedWebhookReceiver();
    const webhookService = new WebhookService(prisma, receiver);
    const availabilityService = new AvailabilityService(prisma);
    const bookingService = new BookingService(prisma, webhookService);

    const app = createExpressApp({
      prisma,
      availabilityService,
      bookingService,
      webhookService,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await disconnectPrisma();
  });

  it('GET /api/health returns 200 OK and database status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { status: string; database: string };
    expect(data.status).toBe('ok');
    expect(data.database).toBe('connected');
  });

  it('GET /api/rooms returns seeded room catalog', async () => {
    const res = await fetch(`${baseUrl}/api/rooms`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      rooms: Array<{ id: string; name: string; price_per_night_formatted: string }>;
    };
    expect(data.rooms.length).toBe(5);
    expect(data.rooms.some((r) => r.id === 'room_deluxe_101')).toBe(true);
  });

  it('GET /api/availability returns filtered rooms for valid query', async () => {
    const res = await fetch(`${baseUrl}/api/availability?check_in=2029-08-10&check_out=2029-08-14&guests=2`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      check_in: string;
      check_out: string;
      nights: number;
      available_rooms_count: number;
      rooms: Array<{ room_id: string; total_price_cents: number }>;
    };

    expect(data.check_in).toBe('2029-08-10');
    expect(data.check_out).toBe('2029-08-14');
    expect(data.nights).toBe(4);
    expect(data.available_rooms_count).toBeGreaterThan(0);
    const deluxe = data.rooms.find((r) => r.room_id === 'room_deluxe_101');
    expect(deluxe?.total_price_cents).toBe(88000);
  });

  it('GET /api/availability returns 400 for invalid dates', async () => {
    const res = await fetch(`${baseUrl}/api/availability?check_in=2029-08-15&check_out=2029-08-10&guests=2`);
    expect(res.status).toBe(400);

    const data = (await res.json()) as { error: { code: string; message: string } };
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('POST /api/bookings successfully creates a confirmed booking', async () => {
    const payload = {
      room_id: 'room_deluxe_101',
      customer_name: 'REST API Tester',
      customer_email: 'rest.tester@example.com',
      check_in: '2029-08-10',
      check_out: '2029-08-14',
      guests: 2,
      idempotency_key: 'rest_idem_001_' + Date.now(),
    };

    const res = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      booking_id: string;
      confirmation_status: string;
      is_idempotent_replay: boolean;
      booking_dates: { total_price_cents: number; total_price_formatted: string };
    };

    expect(data.confirmation_status).toBe('CONFIRMED');
    expect(data.is_idempotent_replay).toBe(false);
    expect(data.booking_id).toMatch(/^bkg_/);
    expect(data.booking_dates.total_price_cents).toBe(88000);
  });

  it('POST /api/bookings handles idempotent replay and conflicts', async () => {
    const idemKey = 'rest_idem_queen_' + Date.now();
    const payload = {
      room_id: 'room_queen_102',
      customer_name: 'Idem User',
      customer_email: 'idem.user@example.com',
      check_in: '2029-08-20',
      check_out: '2029-08-24',
      guests: 2,
      idempotency_key: idemKey,
    };

    const res1 = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as { booking_id: string; is_idempotent_replay: boolean };
    expect(data1.is_idempotent_replay).toBe(false);

    // Exact replay -> returns 200 OK with same booking
    const res2 = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as { booking_id: string; is_idempotent_replay: boolean };
    expect(data2.is_idempotent_replay).toBe(true);
    expect(data2.booking_id).toBe(data1.booking_id);

    // Mismatched payload with same idempotency key -> returns 409 IDEMPOTENCY_CONFLICT
    const res3 = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, guests: 3 }),
    });
    expect(res3.status).toBe(409);
    const data3 = (await res3.json()) as { error: { code: string } };
    expect(data3.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('POST /api/bookings respects Idempotency-Key HTTP header for retries', async () => {
    const headerKey = 'header_idem_key_' + Date.now();
    const payload = {
      room_id: 'room_cozy_301',
      customer_name: 'Header Idem User',
      customer_email: 'header.idem@example.com',
      check_in: '2029-08-26',
      check_out: '2029-08-28',
      guests: 1,
    };

    const res1 = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': headerKey,
      },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as { booking_id: string; is_idempotent_replay: boolean };
    expect(data1.is_idempotent_replay).toBe(false);

    const res2 = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': headerKey,
      },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as { booking_id: string; is_idempotent_replay: boolean };
    expect(data2.is_idempotent_replay).toBe(true);
    expect(data2.booking_id).toBe(data1.booking_id);
  });

  it('GET /api/bookings/:id returns booking details', async () => {
    const booking = await prisma.booking.findFirst({
      where: { room_id: 'room_deluxe_101' },
    });
    expect(booking).not.toBeNull();

    const res = await fetch(`${baseUrl}/api/bookings/${booking!.id}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { booking_id: string; confirmation_status: string };
    expect(data.booking_id).toBe(booking!.id);
    expect(data.confirmation_status).toBe('CONFIRMED');
  });

  it('GET /api/bookings/:id returns 404 for non-existent booking', async () => {
    const res = await fetch(`${baseUrl}/api/bookings/bkg_non_existent_999`);
    expect(res.status).toBe(404);
  });
});
