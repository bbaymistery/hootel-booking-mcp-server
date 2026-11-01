import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import type { BookingCreatedPayload } from '../models/webhook.model.js';
import type { BookRoomInput } from '../schemas/booking.schema.js';
import { calculateNights, calculateTotalPriceCents, formatUsd } from '../utils/money.js';
import { computeCanonicalBookingHash } from '../utils/hash.js';
import { AppError } from '../errors/app-error.js';
import { WebhookService } from './webhook.service.js';

export interface BookRoomResult {
  booking_id: string;
  confirmation_status: 'CONFIRMED';
  is_idempotent_replay: boolean;
  currency: 'USD';
  room: {
    room_id: string;
    name: string;
    capacity: number;
    price_per_night_cents: number;
    price_per_night_formatted: string;
  };
  customer: {
    customer_id: string;
    name: string;
    email: string;
  };
  booking_dates: {
    check_in: string;
    check_out: string;
    nights: number;
    total_price_cents: number;
    total_price_formatted: string;
  };
  created_at: string;
}

interface TransactionOutput {
  bookingResult: BookRoomResult;
  outboxEventId: string | null;
  isReplay: boolean;
}

export class BookingService {
  private readonly prisma: PrismaClient;
  private readonly webhookService: WebhookService;

  constructor(
    prisma: PrismaClient = getPrismaClient(),
    webhookService: WebhookService = new WebhookService(prisma)
  ) {
    this.prisma = prisma;
    this.webhookService = webhookService;
  }

  public async bookRoom(params: BookRoomInput): Promise<BookRoomResult> {
    const nights = calculateNights(params.check_in, params.check_out);
    const requestHash = computeCanonicalBookingHash(params);
    const idempotencyKey = params.idempotency_key?.trim() || null;

    const checkInDate = new Date(params.check_in + 'T00:00:00.000Z');
    const checkOutDate = new Date(params.check_out + 'T00:00:00.000Z');

    try {
      const txOutput = await this.prisma.$transaction(async (tx): Promise<TransactionOutput> => {
        // 1. Full-payload idempotency verification
        if (idempotencyKey) {
          const existingBooking = await tx.booking.findUnique({
            where: { idempotency_key: idempotencyKey },
            include: { room: true, customer: true },
          });

          if (existingBooking) {
            if (existingBooking.request_hash === requestHash) {
              const checkInStr = existingBooking.check_in.toISOString().split('T')[0]!;
              const checkOutStr = existingBooking.check_out.toISOString().split('T')[0]!;
              const existingNights = calculateNights(checkInStr, checkOutStr);

              return {
                isReplay: true,
                outboxEventId: null,
                bookingResult: {
                  booking_id: existingBooking.id,
                  confirmation_status: 'CONFIRMED',
                  is_idempotent_replay: true,
                  currency: 'USD',
                  room: {
                    room_id: existingBooking.room.id,
                    name: existingBooking.room.name,
                    capacity: existingBooking.room.capacity,
                    price_per_night_cents: existingBooking.room.price_per_night_cents,
                    price_per_night_formatted: formatUsd(existingBooking.room.price_per_night_cents),
                  },
                  customer: {
                    customer_id: existingBooking.customer.id,
                    name: existingBooking.customer.name,
                    email: existingBooking.customer.email,
                  },
                  booking_dates: {
                    check_in: checkInStr,
                    check_out: checkOutStr,
                    nights: existingNights,
                    total_price_cents: existingBooking.total_price_cents,
                    total_price_formatted: formatUsd(existingBooking.total_price_cents),
                  },
                  created_at: existingBooking.created_at.toISOString(),
                },
              };
            } else {
              throw AppError.idempotencyConflict(idempotencyKey);
            }
          }
        }

        // 2. Lock the room row with SELECT FOR UPDATE to serialize concurrent bookings on the same room
        const lockedRooms: any[] = await tx.$queryRaw`
          SELECT id, name, capacity, price_per_night_cents, status 
          FROM rooms 
          WHERE id = ${params.room_id} 
          FOR UPDATE
        `;

        const room = lockedRooms[0];
        if (!room) {
          throw AppError.roomNotFound(params.room_id);
        }

        if (room.status !== 'AVAILABLE') {
          throw AppError.roomInactive(params.room_id, room.status);
        }

        if (room.capacity < params.guests) {
          throw AppError.capacityExceeded(params.guests, room.capacity);
        }

        // 3. Application-level overlap check in transaction (half-open interval [check_in, check_out))
        const overlapCount = await tx.booking.count({
          where: {
            room_id: params.room_id,
            status: 'CONFIRMED',
            check_in: { lt: checkOutDate },
            check_out: { gt: checkInDate },
          },
        });

        if (overlapCount > 0) {
          throw AppError.roomUnavailable(params.room_id, params.check_in, params.check_out);
        }

        // 4. Customer upsert
        const normalizedEmail = params.customer_email.trim().toLowerCase();
        let customer = await tx.customer.findUnique({
          where: { email: normalizedEmail },
        });

        if (!customer) {
          const newCustomerId = `cust_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
          customer = await tx.customer.create({
            data: {
              id: newCustomerId,
              name: params.customer_name.trim(),
              email: normalizedEmail,
            },
          });
        }

        // 5. Total pricing calculation
        const totalPriceCents = calculateTotalPriceCents(nights, room.price_per_night_cents);
        const bookingId = `bkg_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
        const createdAt = new Date();

        // 6. Insert Booking record
        await tx.booking.create({
          data: {
            id: bookingId,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            room_id: room.id,
            customer_id: customer.id,
            check_in: checkInDate,
            check_out: checkOutDate,
            guests: params.guests,
            currency: 'USD',
            total_price_cents: totalPriceCents,
            status: 'CONFIRMED',
            created_at: createdAt,
          },
        });

        // 7. Insert Webhook Outbox Event in the SAME transaction
        const eventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
        const outboxPayload: BookingCreatedPayload = {
          booking_id: bookingId,
          idempotency_key: idempotencyKey,
          room_id: room.id,
          customer_id: customer.id,
          check_in: params.check_in,
          check_out: params.check_out,
          guests: params.guests,
          currency: 'USD',
          total_price_cents: totalPriceCents,
          created_at: createdAt.toISOString(),
        };

        await tx.webhookOutbox.create({
          data: {
            id: eventId,
            event_type: 'booking.created',
            payload: JSON.stringify(outboxPayload),
            delivery_status: 'PENDING',
            retry_count: 0,
            created_at: createdAt,
          },
        });

        return {
          isReplay: false,
          outboxEventId: eventId,
          bookingResult: {
            booking_id: bookingId,
            confirmation_status: 'CONFIRMED',
            is_idempotent_replay: false,
            currency: 'USD',
            room: {
              room_id: room.id,
              name: room.name,
              capacity: room.capacity,
              price_per_night_cents: room.price_per_night_cents,
              price_per_night_formatted: formatUsd(room.price_per_night_cents),
            },
            customer: {
              customer_id: customer.id,
              name: customer.name,
              email: customer.email,
            },
            booking_dates: {
              check_in: params.check_in,
              check_out: params.check_out,
              nights,
              total_price_cents: totalPriceCents,
              total_price_formatted: formatUsd(totalPriceCents),
            },
            created_at: createdAt.toISOString(),
          },
        };
      });

      // Post-commit trigger: only dispatch if newly committed booking
      if (!txOutput.isReplay && txOutput.outboxEventId) {
        this.webhookService.triggerAsyncDispatch(txOutput.outboxEventId);
      }

      return txOutput.bookingResult;
    } catch (error: any) {
      // Catch PostgreSQL EXCLUDE constraint violation (code 23P01) or constraint name
      if (
        error?.code === '23P01' ||
        error?.message?.includes('no_overlapping_bookings') ||
        error?.message?.includes('exclusion_violation')
      ) {
        throw AppError.roomUnavailable(params.room_id, params.check_in, params.check_out);
      }
      throw error;
    }
  }
}
