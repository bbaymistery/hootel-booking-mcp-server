import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { BookingService } from '../../src/services/booking.service.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { AppError } from '../../src/errors/app-error.js';

describe('PostgreSQL EXCLUDE Constraint Boundary & Interval Tests', () => {
  const prisma = getPrismaClient();
  const bookingService = new BookingService(prisma);
  const availabilityService = new AvailabilityService(prisma);

  beforeAll(async () => {
    await seedNeonRooms(prisma);
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_queen_102',
        check_in: { gte: new Date('2028-07-01T00:00:00.000Z') },
        check_out: { lte: new Date('2028-07-30T00:00:00.000Z') },
      },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('1. Rejects a second booking for the same room and same dates', async () => {
    // First booking succeeds
    const firstBooking = await bookingService.bookRoom({
      room_id: 'room_queen_102',
      customer_name: 'Boundary Test User 1',
      customer_email: 'boundary.user1@test.com',
      check_in: '2028-07-01',
      check_out: '2028-07-05',
      guests: 2,
      idempotency_key: 'bkg_boundary_initial_01',
    });

    expect(firstBooking.confirmation_status).toBe('CONFIRMED');

    // Second booking on exact same dates must fail with ROOM_UNAVAILABLE
    await expect(
      bookingService.bookRoom({
        room_id: 'room_queen_102',
        customer_name: 'Boundary Test User 2',
        customer_email: 'boundary.user2@test.com',
        check_in: '2028-07-01',
        check_out: '2028-07-05',
        guests: 2,
        idempotency_key: 'bkg_boundary_conflict_02',
      })
    ).rejects.toThrowError(AppError);
  });

  it('2. Accepts a booking when check-out date of previous booking matches check-in of new booking (half-open [check_in, check_out))', async () => {
    // Previous booking is 2028-07-01 to 2028-07-05
    // Turnaround booking starts exactly on 2028-07-05 to 2028-07-08
    const turnaroundBooking = await bookingService.bookRoom({
      room_id: 'room_queen_102',
      customer_name: 'Turnaround Guest',
      customer_email: 'turnaround@test.com',
      check_in: '2028-07-05',
      check_out: '2028-07-08',
      guests: 2,
      idempotency_key: 'bkg_boundary_turnaround_03',
    });

    expect(turnaroundBooking.confirmation_status).toBe('CONFIRMED');
    expect(turnaroundBooking.booking_dates.check_in).toBe('2028-07-05');
    expect(turnaroundBooking.booking_dates.check_out).toBe('2028-07-08');
  });

  it('3. CANCELLED bookings do not block room availability or prevent new bookings', async () => {
    // Create a booking for 2028-07-15 to 2028-07-20
    const cancelCandidate = await bookingService.bookRoom({
      room_id: 'room_queen_102',
      customer_name: 'Will Cancel Guest',
      customer_email: 'will.cancel@test.com',
      check_in: '2028-07-15',
      check_out: '2028-07-20',
      guests: 2,
      idempotency_key: 'bkg_boundary_cancel_04',
    });

    // Update status to CANCELLED in database
    await prisma.booking.update({
      where: { id: cancelCandidate.booking_id },
      data: { status: 'CANCELLED' },
    });

    // Verify availability check returns the room as AVAILABLE
    const avail = await availabilityService.checkAvailability({
      check_in: '2028-07-15',
      check_out: '2028-07-20',
      guests: 2,
    });

    const isAvailable = avail.rooms.some((r) => r.room_id === 'room_queen_102');
    expect(isAvailable).toBe(true);

    // Book the same cancelled interval with a new customer
    const newBooking = await bookingService.bookRoom({
      room_id: 'room_queen_102',
      customer_name: 'Replacement Guest',
      customer_email: 'replacement@test.com',
      check_in: '2028-07-15',
      check_out: '2028-07-20',
      guests: 2,
      idempotency_key: 'bkg_boundary_replacement_05',
    });

    expect(newBooking.confirmation_status).toBe('CONFIRMED');
    expect(newBooking.booking_id).not.toBe(cancelCandidate.booking_id);
  });
});
