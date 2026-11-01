import { describe, it, expect } from 'vitest';
import { computeCanonicalBookingHash } from '../../src/utils/hash.js';

describe('computeCanonicalBookingHash', () => {
  it('generates identical hash regardless of property insertion order', () => {
    const p1 = {
      room_id: 'room_101',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      check_in: '2026-11-10',
      check_out: '2026-11-14',
      guests: 2
    };

    const p2 = {
      guests: 2,
      check_out: '2026-11-14',
      room_id: 'room_101',
      check_in: '2026-11-10',
      customer_email: 'jane@example.com',
      customer_name: 'Jane Doe'
    };

    expect(computeCanonicalBookingHash(p1)).toBe(computeCanonicalBookingHash(p2));
  });

  it('normalizes customer email case and trims whitespace', () => {
    const raw = {
      room_id: '  room_101  ',
      customer_name: ' Jane Doe ',
      customer_email: '  Jane.Doe@EXAMPLE.COM  ',
      check_in: ' 2026-11-10 ',
      check_out: ' 2026-11-14 ',
      guests: 2
    };

    const normalized = {
      room_id: 'room_101',
      customer_name: 'Jane Doe',
      customer_email: 'jane.doe@example.com',
      check_in: '2026-11-10',
      check_out: '2026-11-14',
      guests: 2
    };

    expect(computeCanonicalBookingHash(raw)).toBe(computeCanonicalBookingHash(normalized));
  });

  it('produces different hashes when any input attribute differs', () => {
    const base = {
      room_id: 'room_101',
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      check_in: '2026-11-10',
      check_out: '2026-11-14',
      guests: 2
    };

    const differentGuests = { ...base, guests: 3 };
    const differentDates = { ...base, check_out: '2026-11-15' };
    const differentRoom = { ...base, room_id: 'room_102' };

    const baseHash = computeCanonicalBookingHash(base);
    expect(computeCanonicalBookingHash(differentGuests)).not.toBe(baseHash);
    expect(computeCanonicalBookingHash(differentDates)).not.toBe(baseHash);
    expect(computeCanonicalBookingHash(differentRoom)).not.toBe(baseHash);
  });
});
