import { z } from 'zod';
import { StrictCalendarDateSchema } from './date.schema.js';

export const BookRoomInputShape = {
  room_id: z.string({ required_error: 'Room ID is required' }).min(1, 'Room ID is required').trim(),
  customer_name: z
    .string({ required_error: 'Customer name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .trim(),
  customer_email: z
    .string({ required_error: 'Customer email is required' })
    .email('Invalid email address format')
    .trim()
    .toLowerCase(),
  check_in: StrictCalendarDateSchema,
  check_out: StrictCalendarDateSchema,
  guests: z
    .number({ required_error: 'Guest count is required' })
    .int('Guest count must be an integer')
    .positive('Guest count must be at least 1')
    .max(10),
  idempotency_key: z.string().min(1).max(64).optional()
};

export const BookRoomInputSchema = z
  .object(BookRoomInputShape)
  .refine((data) => data.check_in < data.check_out, {
    message: 'check_out must be strictly after check_in (minimum stay is 1 night)',
    path: ['check_out']
  });

export type BookRoomInput = z.infer<typeof BookRoomInputSchema>;
