import { Router, type Request, type Response, type NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../db/prisma.js';
import { BookingService } from '../../services/booking.service.js';
import { BookRoomInputSchema } from '../../schemas/booking.schema.js';
import { AppError } from '../../errors/app-error.js';
import { calculateNights, formatUsd } from '../../utils/money.js';

export function createBookingRouter(
  prisma: PrismaClient = getPrismaClient(),
  bookingService: BookingService = new BookingService(prisma)
): Router {
  const router = Router();

  // POST /api/bookings
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Support standard Idempotency-Key header or body field
      const headerKey = req.header('idempotency-key') || req.header('x-idempotency-key');
      const idempotencyKey =
        (headerKey && typeof headerKey === 'string' ? headerKey.trim() : undefined) ||
        (typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key.trim() : undefined);

      const payload = {
        ...req.body,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      };

      const validated = BookRoomInputSchema.parse(payload);
      const result = await bookingService.bookRoom(validated);
      res.status(result.is_idempotent_replay ? 200 : 201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/bookings (list all, ordered by newest first)
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const bookings = await prisma.booking.findMany({
        orderBy: { created_at: 'desc' },
        include: { room: true, customer: true },
      });
      res.json({
        total: bookings.length,
        bookings: bookings.map((b) => ({
          booking_id: b.id,
          confirmation_status: b.status,
          currency: b.currency,
          room: b.room ? { room_id: b.room.id, name: b.room.name } : null,
          customer: b.customer ? { name: b.customer.name, email: b.customer.email } : null,
          check_in: b.check_in.toISOString().split('T')[0],
          check_out: b.check_out.toISOString().split('T')[0],
          guests: b.guests,
          total_price_formatted: formatUsd(b.total_price_cents),
          created_at: b.created_at.toISOString(),
        })),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  // GET /api/bookings/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params['id'];
      const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!bookingId) {
        throw AppError.invalidInput('Booking ID is required');
      }

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { room: true, customer: true },
      });

      if (!booking) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Booking with ID '${bookingId}' was not found.`,
          },
        });
        return;
      }

      const checkInStr = booking.check_in.toISOString().split('T')[0]!;
      const checkOutStr = booking.check_out.toISOString().split('T')[0]!;
      const nights = calculateNights(checkInStr, checkOutStr);

      res.json({
        booking_id: booking.id,
        confirmation_status: booking.status,
        currency: booking.currency,
        room: booking.room
          ? {
              room_id: booking.room.id,
              name: booking.room.name,
              capacity: booking.room.capacity,
              price_per_night_cents: booking.room.price_per_night_cents,
              price_per_night_formatted: formatUsd(booking.room.price_per_night_cents),
            }
          : null,
        customer: booking.customer
          ? {
              customer_id: booking.customer.id,
              name: booking.customer.name,
              email: booking.customer.email,
            }
          : null,
        booking_dates: {
          check_in: checkInStr,
          check_out: checkOutStr,
          nights,
          total_price_cents: booking.total_price_cents,
          total_price_formatted: formatUsd(booking.total_price_cents),
        },
        created_at: booking.created_at.toISOString(),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
