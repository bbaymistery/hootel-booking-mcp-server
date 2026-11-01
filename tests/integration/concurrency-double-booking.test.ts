import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { BookingService } from '../../src/services/booking.service.js';
import { seedNeonRooms } from '../../prisma/seed.js';

describe('PostgreSQL Concurrency & Double-Booking Prevention', () => {
  const prisma = getPrismaClient();
  const bookingService = new BookingService(prisma);

  beforeAll(async () => {
    await seedNeonRooms(prisma);
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_suite_201',
        check_in: { gte: new Date('2029-05-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-05-10T00:00:00.000Z') },
      },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('prevents double-booking when two concurrent transactions attempt booking the same room', async () => {
    const p1 = bookingService.bookRoom({
      room_id: 'room_suite_201',
      customer_name: 'Concurrent Worker 1',
      customer_email: 'worker1@test.com',
      check_in: '2029-05-01',
      check_out: '2029-05-05',
      guests: 2,
      idempotency_key: 'worker_key_1_' + Date.now(),
    });

    const p2 = bookingService.bookRoom({
      room_id: 'room_suite_201',
      customer_name: 'Concurrent Worker 2',
      customer_email: 'worker2@test.com',
      check_in: '2029-05-01',
      check_out: '2029-05-05',
      guests: 2,
      idempotency_key: 'worker_key_2_' + Date.now(),
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
