import { createHash } from 'node:crypto';

export interface BookingPayloadToHash {
  room_id: string;
  customer_name: string;
  customer_email: string;
  check_in: string;
  check_out: string;
  guests: number;
}

/**
 * Computes a deterministic SHA-256 hash of a normalized booking request payload.
 * Normalization includes trimming strings and lowercasing email addresses.
 */
export function computeCanonicalBookingHash(payload: BookingPayloadToHash): string {
  const normalized = {
    check_in: payload.check_in.trim(),
    check_out: payload.check_out.trim(),
    customer_email: payload.customer_email.trim().toLowerCase(),
    customer_name: payload.customer_name.trim(),
    guests: payload.guests,
    room_id: payload.room_id.trim()
  };

  const canonicalJson = JSON.stringify(normalized, Object.keys(normalized).sort());
  return createHash('sha256').update(canonicalJson).digest('hex');
}
