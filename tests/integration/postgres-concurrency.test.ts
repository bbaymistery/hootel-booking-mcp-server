import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { createExpressApp } from '../../src/api/app.js';
import { BookingService } from '../../src/services/booking.service.js';
import { seedNeonRooms } from '../../prisma/seed.js';

describe('PostgreSQL Level Atomic Concurrency & Double-Booking Protection', () => {
  const prisma = getPrismaClient();
  const bookingService = new BookingService(prisma);
  const app = createExpressApp({ prisma, bookingService });
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await seedNeonRooms(prisma);
    // Ensure test room is clean for the test dates
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_deluxe_101',
        check_in: { gte: new Date('2028-06-01T00:00:00.000Z') },
        check_out: { lte: new Date('2028-06-10T00:00:00.000Z') },
      },
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
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

  it('rejects parallel simultaneous bookings for the exact same room and dates with exactly 1 success (201 Created) and 1 rejection (409 Conflict)', async () => {
    const bookingReq1 = {
      room_id: 'room_deluxe_101',
      customer_name: 'Concurrent User A',
      customer_email: 'user.a@concurrent-test.com',
      check_in: '2028-06-01',
      check_out: '2028-06-05',
      guests: 2,
      idempotency_key: 'concurrent_user_a_' + Date.now(),
    };

    const bookingReq2 = {
      room_id: 'room_deluxe_101',
      customer_name: 'Concurrent User B',
      customer_email: 'user.b@concurrent-test.com',
      check_in: '2028-06-01',
      check_out: '2028-06-05',
      guests: 2,
      idempotency_key: 'concurrent_user_b_' + Date.now(),
    };

    // Send both booking requests simultaneously in parallel via native fetch
    const [rawRes1, rawRes2] = await Promise.all([
      fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingReq1),
      }),
      fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingReq2),
      }),
    ]);

    const res1 = { status: rawRes1.status, body: (await rawRes1.json()) as any };
    const res2 = { status: rawRes2.status, body: (await rawRes2.json()) as any };

    const statuses = [res1.status, res2.status].sort();

    // Exactly one must be 201 Created, and exactly one must be 409 Conflict
    expect(statuses).toEqual([201, 409]);

    const successRes = res1.status === 201 ? res1 : res2;
    const conflictRes = res1.status === 409 ? res1 : res2;

    expect(successRes.body.confirmation_status).toBe('CONFIRMED');
    expect(successRes.body.room.room_id).toBe('room_deluxe_101');

    expect(conflictRes.body.error.code).toBe('ROOM_UNAVAILABLE');
    expect(conflictRes.body.error.message).toContain('is already booked');

    // Confirm that in Neon database, only 1 confirmed booking exists for this interval
    const dbBookings = await prisma.booking.findMany({
      where: {
        room_id: 'room_deluxe_101',
        check_in: new Date('2028-06-01T00:00:00.000Z'),
        check_out: new Date('2028-06-05T00:00:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    expect(dbBookings.length).toBe(1);
  });
});
