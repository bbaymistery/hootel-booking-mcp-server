import { describe, it, expect } from 'vitest';
import { calculateNights, calculateTotalPriceCents, formatUsd } from '../../src/utils/money.js';

describe('Money and Stay Duration Calculations', () => {
  it('calculates nights accurately across standard month boundaries', () => {
    expect(calculateNights('2026-11-10', '2026-11-14')).toBe(4);
    expect(calculateNights('2026-10-30', '2026-11-02')).toBe(3);
    expect(calculateNights('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('calculates nights accurately across leap year February', () => {
    expect(calculateNights('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('throws on non-positive stay durations', () => {
    expect(() => calculateNights('2026-11-10', '2026-11-10')).toThrow(/Invalid stay duration/);
    expect(() => calculateNights('2026-11-15', '2026-11-10')).toThrow(/Invalid stay duration/);
  });

  it('calculates total price in cents without floating-point inaccuracies', () => {
    // 4 nights @ $220.00 (22000 cents) = 88000 cents ($880.00)
    expect(calculateTotalPriceCents(4, 22000)).toBe(88000);
    // 7 nights @ $160.00 (16000 cents) = 112000 cents ($1120.00)
    expect(calculateTotalPriceCents(7, 16000)).toBe(112000);
  });

  it('formats cents into standard USD strings', () => {
    expect(formatUsd(22000)).toBe('$220.00 USD');
    expect(formatUsd(88000)).toBe('$880.00 USD');
    expect(formatUsd(15050)).toBe('$150.50 USD');
    expect(formatUsd(99)).toBe('$0.99 USD');
    expect(formatUsd(0)).toBe('$0.00 USD');
  });
});
