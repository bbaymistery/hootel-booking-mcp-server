import { z } from 'zod';
import { StrictCalendarDateSchema } from './date.schema.js';

export const CheckAvailabilityInputShape = {
  check_in: StrictCalendarDateSchema,
  check_out: StrictCalendarDateSchema,
  guests: z
    .number({ required_error: 'Guest count is required' })
    .int('Guest count must be an integer')
    .positive('Guest count must be at least 1')
    .max(10, 'Single booking limit is 10 guests')
};

export const CheckAvailabilityInputSchema = z
  .object(CheckAvailabilityInputShape)
  .refine((data) => data.check_in < data.check_out, {
    message: 'check_out must be strictly after check_in (minimum stay is 1 night)',
    path: ['check_out']
  });

export type CheckAvailabilityInput = z.infer<typeof CheckAvailabilityInputSchema>;
