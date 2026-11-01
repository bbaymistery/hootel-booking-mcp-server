import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import { calculateNights, calculateTotalPriceCents, formatUsd } from '../utils/money.js';
import type { CheckAvailabilityInput } from '../schemas/availability.schema.js';

export interface AvailableRoomResult {
  room_id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  price_per_night_formatted: string;
  total_price_cents: number;
  total_price_formatted: string;
  nights: number;
  currency: 'USD';
  availability_status: 'AVAILABLE';
}

export interface UnavailableRoomInfo {
  room_id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  price_per_night_formatted: string;
  reason: 'UNDER_MAINTENANCE' | 'EXCEEDS_CAPACITY' | 'ALREADY_BOOKED';
  reason_message: string;
  next_available_date?: string | null;
  conflicting_booking?: {
    check_in: string;
    check_out: string;
  } | null;
}

export interface CheckAvailabilityResult {
  check_in: string;
  check_out: string;
  nights: number;
  currency: 'USD';
  requested_guests: number;
  available_rooms_count: number;
  rooms: AvailableRoomResult[];
  unavailable_rooms?: UnavailableRoomInfo[];
}

export class AvailabilityService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient = getPrismaClient()) {
    this.prisma = prisma;
  }

  public async checkAvailability(params: CheckAvailabilityInput): Promise<CheckAvailabilityResult> {
    const nights = calculateNights(params.check_in, params.check_out);
    const checkInDate = new Date(params.check_in + 'T00:00:00.000Z');
    const checkOutDate = new Date(params.check_out + 'T00:00:00.000Z');

    // Query confirmed bookings overlapping the requested half-open interval [check_in, check_out)
    const overlappingBookings = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        check_in: { lt: checkOutDate },
        check_out: { gt: checkInDate },
      },
      select: { room_id: true, check_in: true, check_out: true },
    });

    const bookedMap = new Map<string, { check_in: string; check_out: string }>();
    for (const b of overlappingBookings) {
      bookedMap.set(b.room_id, {
        check_in: b.check_in.toISOString().split('T')[0]!,
        check_out: b.check_out.toISOString().split('T')[0]!,
      });
    }

    const allRooms = await this.prisma.room.findMany({
      orderBy: { price_per_night_cents: 'asc' },
    });

    const formattedRooms: AvailableRoomResult[] = [];
    const unavailableRooms: UnavailableRoomInfo[] = [];

    for (const room of allRooms) {
      const isMaint = room.status !== 'AVAILABLE';
      const exceedsCap = room.capacity < params.guests;
      const isBooked = bookedMap.has(room.id);

      if (!isMaint && !exceedsCap && !isBooked) {
        const totalPriceCents = calculateTotalPriceCents(nights, room.price_per_night_cents);
        formattedRooms.push({
          room_id: room.id,
          name: room.name,
          capacity: room.capacity,
          price_per_night_cents: room.price_per_night_cents,
          price_per_night_formatted: formatUsd(room.price_per_night_cents),
          total_price_cents: totalPriceCents,
          total_price_formatted: formatUsd(totalPriceCents),
          nights,
          currency: 'USD',
          availability_status: 'AVAILABLE',
        });
      } else {
        let reason: 'UNDER_MAINTENANCE' | 'EXCEEDS_CAPACITY' | 'ALREADY_BOOKED';
        let reason_message = '';
        let next_available_date: string | null = null;
        let conflicting_booking: { check_in: string; check_out: string } | null = null;

        if (isMaint) {
          reason = 'UNDER_MAINTENANCE';
          reason_message = 'Currently undergoing scheduled luxury maintenance & interior enhancement.';
        } else if (exceedsCap) {
          reason = 'EXCEEDS_CAPACITY';
          reason_message = `Accommodates up to ${room.capacity} guest${room.capacity === 1 ? '' : 's'} (${params.guests} guests requested).`;
        } else {
          reason = 'ALREADY_BOOKED';
          const b = bookedMap.get(room.id)!;
          conflicting_booking = b;
          next_available_date = b.check_out;
          reason_message = `Reserved from ${b.check_in} to ${b.check_out}. Next available from ${b.check_out}.`;
        }

        unavailableRooms.push({
          room_id: room.id,
          name: room.name,
          capacity: room.capacity,
          price_per_night_cents: room.price_per_night_cents,
          price_per_night_formatted: formatUsd(room.price_per_night_cents),
          reason,
          reason_message,
          next_available_date,
          conflicting_booking,
        });
      }
    }

    return {
      check_in: params.check_in,
      check_out: params.check_out,
      nights,
      currency: 'USD',
      requested_guests: params.guests,
      available_rooms_count: formattedRooms.length,
      rooms: formattedRooms,
      unavailable_rooms: unavailableRooms,
    };
  }
}
