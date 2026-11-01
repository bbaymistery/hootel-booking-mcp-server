import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { BookingService } from '../../src/services/booking.service.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';
import { AppError } from '../../src/errors/app-error.js';

describe('Idempotency Lifecycle & Canonical Payload Hashing', () => {
  const prisma = getPrismaClient();
  let receiver: SimulatedWebhookReceiver;
  let webhookService: WebhookService;
  let bookingService: BookingService;

  beforeAll(async () => {
    await seedNeonRooms(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    receiver = new SimulatedWebhookReceiver();
    webhookService = new WebhookService(prisma, receiver);
    bookingService = new BookingService(prisma, webhookService);

    // Clean up test bookings for 2029-07 dates
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-07-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-07-31T00:00:00.000Z') },
      },
    });
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-07-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-07-31T00:00:00.000Z') },
      },
    });
  });

  it('returns identical booking confirmation with is_idempotent_replay=true for exact repeat request', async () => {
    const idemKey = 'idem_key_abc_' + Date.now();
    const payload = {
      room_id: 'room_deluxe_101',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      check_in: '2029-07-10',
      check_out: '2029-07-14',
      guests: 2,
      idempotency_key: idemKey,
    };

    const first = await bookingService.bookRoom(payload);
    expect(first.is_idempotent_replay).toBe(false);

    // Replay with identical payload
    const second = await bookingService.bookRoom(payload);
    expect(second.is_idempotent_replay).toBe(true);
    expect(second.booking_id).toBe(first.booking_id);
    expect(second.booking_dates.total_price_cents).toBe(first.booking_dates.total_price_cents);
    expect(second.customer.customer_id).toBe(first.customer.customer_id);

    // Verify only ONE booking row exists for this idempotency key
    const bookingRowsCount = await prisma.booking.count({
      where: { idempotency_key: idemKey },
    });
    expect(bookingRowsCount).toBe(1);
  });

  it('rejects with 409 IDEMPOTENCY_CONFLICT when payload changes under same idempotency key', async () => {
    const idemKey = 'idem_key_conflict_' + Date.now();
    const payload = {
      room_id: 'room_deluxe_101',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      check_in: '2029-07-10',
      check_out: '2029-07-14',
      guests: 2,
      idempotency_key: idemKey,
    };

    await bookingService.bookRoom(payload);

    // Same key, different guest count
    await expect(
      bookingService.bookRoom({
        ...payload,
        guests: 1,
      })
    ).rejects.toThrowError(AppError);
  });
});
