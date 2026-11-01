import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { seedNeonRooms } from '../../prisma/seed.js';

describe('AvailabilityService Integration Tests', () => {
  const prisma = getPrismaClient();
  const service = new AvailabilityService(prisma);

  beforeAll(async () => {
    await seedNeonRooms(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-11-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-11-30T00:00:00.000Z') },
      },
    });
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-11-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-11-30T00:00:00.000Z') },
      },
    });
  });

  it('filters out rooms that are in MAINTENANCE status', async () => {
    const result = await service.checkAvailability({
      check_in: '2029-11-10',
      check_out: '2029-11-14',
      guests: 1,
    });

    const roomIds = result.rooms.map((r) => r.room_id);
    expect(roomIds).not.toContain('room_maint_901');
    expect(roomIds).toContain('room_deluxe_101');
    expect(roomIds).toContain('room_queen_102');
    expect(roomIds).toContain('room_suite_201');
    expect(roomIds).toContain('room_cozy_301');
  });

  it('filters out rooms with insufficient capacity for the requested guests', async () => {
    const result = await service.checkAvailability({
      check_in: '2029-11-10',
      check_out: '2029-11-14',
      guests: 5,
    });

    // Only Presidential Penthouse Suite (capacity 6) should be available
    expect(result.rooms.length).toBe(1);
    expect(result.rooms[0]?.room_id).toBe('room_suite_201');
    expect(result.rooms[0]?.capacity).toBe(6);
  });

  it('excludes a room when an existing booking overlaps the requested dates', async () => {
    // Seed customer and confirmed booking for room_deluxe_101 [2029-11-10 to 2029-11-15)
    await prisma.customer.upsert({
      where: { id: 'cust_avail_test' },
      update: {},
      create: { id: 'cust_avail_test', name: 'John Doe', email: 'john.avail@test.com' },
    });

    await prisma.booking.create({
      data: {
        id: 'bkg_avail_overlap_1',
        room_id: 'room_deluxe_101',
        customer_id: 'cust_avail_test',
        check_in: new Date('2029-11-10T00:00:00.000Z'),
        check_out: new Date('2029-11-15T00:00:00.000Z'),
        guests: 2,
        total_price_cents: 110000,
        status: 'CONFIRMED',
      },
    });

    // Query overlapping dates [2029-11-12 to 2029-11-14)
    const result = await service.checkAvailability({
      check_in: '2029-11-12',
      check_out: '2029-11-14',
      guests: 2,
    });

    const roomIds = result.rooms.map((r) => r.room_id);
    expect(roomIds).not.toContain('room_deluxe_101');
    expect(roomIds).toContain('room_queen_102');
  });

  it('allows same-day checkout/checkin turnover (half-open interval non-overlap)', async () => {
    await prisma.customer.upsert({
      where: { id: 'cust_avail_test' },
      update: {},
      create: { id: 'cust_avail_test', name: 'John Doe', email: 'john.avail@test.com' },
    });

    await prisma.booking.create({
      data: {
        id: 'bkg_avail_turnover_1',
        room_id: 'room_deluxe_101',
        customer_id: 'cust_avail_test',
        check_in: new Date('2029-11-10T00:00:00.000Z'),
        check_out: new Date('2029-11-15T00:00:00.000Z'),
        guests: 2,
        total_price_cents: 110000,
        status: 'CONFIRMED',
      },
    });

    // 1. Query stay checking in on the day previous guest checks out: [2029-11-15 to 2029-11-20)
    const afterResult = await service.checkAvailability({
      check_in: '2029-11-15',
      check_out: '2029-11-20',
      guests: 2,
    });
    expect(afterResult.rooms.map((r) => r.room_id)).toContain('room_deluxe_101');

    // 2. Query stay checking out on the day next guest checks in: [2029-11-05 to 2029-11-10)
    const beforeResult = await service.checkAvailability({
      check_in: '2029-11-05',
      check_out: '2029-11-10',
      guests: 2,
    });
    expect(beforeResult.rooms.map((r) => r.room_id)).toContain('room_deluxe_101');
  });
});
