export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface BookingRecord {
  id: string;
  idempotency_key: string | null;
  request_hash: string | null;
  room_id: string;
  customer_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  currency: 'USD';
  total_price_cents: number;
  status: BookingStatus;
  created_at: string;
}
