import { z } from 'zod';

/**
 * Strict calendar date schema enforcing:
 * 1. Format: YYYY-MM-DD
 * 2. Sensible calendar century: 2000–2099 (avoids JS Date.UTC 0-99 century rollover bug)
 * 3. Leap-year validity (e.g. 2028-02-29 is valid, 2026-02-29 is invalid)
 * 4. Month lengths (e.g. April 31 is invalid)
 */
export const StrictCalendarDateSchema = z
  .string({ required_error: 'Date is required' })
  .regex(
    /^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    'Date must match format YYYY-MM-DD and fall between years 2000 and 2099'
  )
  .refine((dateStr) => {
    const parts = dateStr.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return false;
    }

    const date = new Date(Date.UTC(2000, 0, 1));
    date.setUTCFullYear(year, month - 1, day);

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, {
    message: 'Invalid calendar date (e.g. February 29 on non-leap year or invalid day for month)'
  });
