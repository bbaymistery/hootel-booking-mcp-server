export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface BookingCreatedPayload {
  booking_id: string;
  idempotency_key: string | null;
  room_id: string;
  customer_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  currency: 'USD';
  total_price_cents: number;
  created_at: string;
}

export interface BookingCreatedEvent {
  id: string;
  event_type: 'booking.created';
  payload: BookingCreatedPayload;
  delivery_status: WebhookDeliveryStatus;
  retry_count: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
}

export type WebhookEvent = BookingCreatedEvent;
