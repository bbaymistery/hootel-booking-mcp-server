import { describe, it, expect } from 'vitest';
import { StrictCalendarDateSchema } from '../../src/schemas/date.schema.js';
import { CheckAvailabilityInputSchema } from '../../src/schemas/availability.schema.js';

describe('StrictCalendarDateSchema', () => {
  it('accepts valid calendar dates within 2000-2099', () => {
    expect(StrictCalendarDateSchema.parse('2026-11-10')).toBe('2026-11-10');
    expect(StrictCalendarDateSchema.parse('2000-01-01')).toBe('2000-01-01');
    expect(StrictCalendarDateSchema.parse('2099-12-31')).toBe('2099-12-31');
  });

  it('accepts valid leap day (2028-02-29 and 2000-02-29)', () => {
    expect(StrictCalendarDateSchema.parse('2028-02-29')).toBe('2028-02-29');
    expect(StrictCalendarDateSchema.parse('2000-02-29')).toBe('2000-02-29');
  });

  it('rejects invalid leap day on non-leap year (2026-02-29)', () => {
    expect(() => StrictCalendarDateSchema.parse('2026-02-29')).toThrow(/Invalid calendar date/);
  });

  it('rejects April 31 (months with 30 days)', () => {
    expect(() => StrictCalendarDateSchema.parse('2026-04-31')).toThrow(/Invalid calendar date/);
    expect(() => StrictCalendarDateSchema.parse('2026-06-31')).toThrow(/Invalid calendar date/);
    expect(() => StrictCalendarDateSchema.parse('2026-09-31')).toThrow(/Invalid calendar date/);
    expect(() => StrictCalendarDateSchema.parse('2026-11-31')).toThrow(/Invalid calendar date/);
  });

  it('rejects years outside 2000-2099 century range', () => {
    expect(() => StrictCalendarDateSchema.parse('1999-12-31')).toThrow(/Date must match format/);
    expect(() => StrictCalendarDateSchema.parse('2100-01-01')).toThrow(/Date must match format/);
    expect(() => StrictCalendarDateSchema.parse('0099-05-10')).toThrow(/Date must match format/);
  });

  it('rejects malformed date strings', () => {
    expect(() => StrictCalendarDateSchema.parse('11-10-2026')).toThrow();
    expect(() => StrictCalendarDateSchema.parse('2026/11/10')).toThrow();
    expect(() => StrictCalendarDateSchema.parse('not-a-date')).toThrow();
  });
});

describe('CheckAvailabilityInputSchema Date Interval Rules', () => {
  it('accepts valid stay where check_out > check_in', () => {
    const valid = {
      check_in: '2026-11-10',
      check_out: '2026-11-14',
      guests: 2
    };
    expect(CheckAvailabilityInputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects 0-night stay where check_in equals check_out', () => {
    const zeroNights = {
      check_in: '2026-11-10',
      check_out: '2026-11-10',
      guests: 2
    };
    expect(() => CheckAvailabilityInputSchema.parse(zeroNights)).toThrow(
      /check_out must be strictly after check_in/
    );
  });

  it('rejects negative nights where check_out < check_in', () => {
    const backwards = {
      check_in: '2026-11-15',
      check_out: '2026-11-10',
      guests: 2
    };
    expect(() => CheckAvailabilityInputSchema.parse(backwards)).toThrow(
      /check_out must be strictly after check_in/
    );
  });
});
