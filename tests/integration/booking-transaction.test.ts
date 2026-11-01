import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { BookingService } from '../../src/services/booking.service.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';
import { AppError } from '../../src/errors/app-error.js';

describe('BookingService Transaction & Business Logic', () => {
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

    // Clean up test bookings for 2029-10 dates
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-10-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-10-31T00:00:00.000Z') },
      },
    });
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-10-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-10-31T00:00:00.000Z') },
      },
    });
  });

  it('creates booking and outbox event atomically upon success', async () => {
    const result = await bookingService.bookRoom({
      room_id: 'room_deluxe_101',
      customer_name: 'Alice Smith',
      customer_email: 'alice.tx@example.com',
      check_in: '2029-10-10',
      check_out: '2029-10-14',
      guests: 2,
    });

    expect(result.confirmation_status).toBe('CONFIRMED');
    expect(result.booking_dates.nights).toBe(4);
    expect(result.booking_dates.total_price_cents).toBe(88000);
    expect(result.booking_dates.total_price_formatted).toBe('$880.00 USD');
    expect(result.currency).toBe('USD');

    // Verify row in bookings table
    const bookingRow = await prisma.booking.findUnique({
      where: { id: result.booking_id },
    });
    expect(bookingRow).toBeDefined();
    expect(bookingRow?.room_id).toBe('room_deluxe_101');
    expect(bookingRow?.total_price_cents).toBe(88000);

    // Verify row in webhook_outbox table
    const outboxRow = await prisma.webhookOutbox.findFirst({
      where: { payload: { contains: result.booking_id } },
    });
    expect(outboxRow).toBeDefined();
    expect(outboxRow?.event_type).toBe('booking.created');

    // Wait for microtask async dispatch
    await new Promise((r) => setTimeout(r, 100));
    expect(receiver.getProcessedCount()).toBeGreaterThanOrEqual(1);
  });

  it('rejects booking when guest count exceeds room capacity', async () => {
    await expect(
      bookingService.bookRoom({
        room_id: 'room_cozy_301', // capacity: 1
        customer_name: 'Bob',
        customer_email: 'bob@example.com',
        check_in: '2029-10-10',
        check_out: '2029-10-12',
        guests: 2,
      })
    ).rejects.toThrow(AppError);
  });

  it('rejects booking when room is in MAINTENANCE status', async () => {
    await expect(
      bookingService.bookRoom({
        room_id: 'room_maint_901',
        customer_name: 'Bob',
        customer_email: 'bob@example.com',
        check_in: '2029-10-10',
        check_out: '2029-10-12',
        guests: 2,
      })
    ).rejects.toThrow(AppError);
  });

  it('rejects booking when room ID does not exist', async () => {
    await expect(
      bookingService.bookRoom({
        room_id: 'non_existent_room',
        customer_name: 'Bob',
        customer_email: 'bob@example.com',
        check_in: '2029-10-10',
        check_out: '2029-10-12',
        guests: 1,
      })
    ).rejects.toThrow(AppError);
  });

  it('prevents double-booking when requested dates overlap an existing reservation', async () => {
    // 1st booking: [2029-10-10 to 2029-10-15)
    await bookingService.bookRoom({
      room_id: 'room_deluxe_101',
      customer_name: 'Alice Overlap',
      customer_email: 'alice.overlap@example.com',
      check_in: '2029-10-10',
      check_out: '2029-10-15',
      guests: 2,
    });

    // 2nd booking attempt for overlapping dates: [2029-10-12 to 2029-10-14)
    await expect(
      bookingService.bookRoom({
        room_id: 'room_deluxe_101',
        customer_name: 'Charlie Overlap',
        customer_email: 'charlie.overlap@example.com',
        check_in: '2029-10-12',
        check_out: '2029-10-14',
        guests: 2,
      })
    ).rejects.toThrow(AppError);
  });

  it('reuses existing customer record if email matches (case-insensitive)', async () => {
    const b1 = await bookingService.bookRoom({
      room_id: 'room_deluxe_101',
      customer_name: 'Alice Smith Case',
      customer_email: 'Alice.Case@Example.COM',
      check_in: '2029-10-01',
      check_out: '2029-10-04',
      guests: 2,
    });

    const b2 = await bookingService.bookRoom({
      room_id: 'room_queen_102',
      customer_name: 'Alice Smith Case',
      customer_email: 'alice.case@example.com',
      check_in: '2029-10-05',
      check_out: '2029-10-08',
      guests: 2,
    });

    expect(b1.customer.customer_id).toBe(b2.customer.customer_id);
  });
});
