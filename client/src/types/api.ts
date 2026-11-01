export interface Room {
  id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  price_per_night_formatted: string;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE';
}

export interface AvailableRoom {
  room_id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  price_per_night_formatted: string;
  total_price_cents: number;
  total_price_formatted: string;
  nights: number;
  currency: 'USD';
  availability_status: 'AVAILABLE';
}

export interface UnavailableRoomInfo {
  room_id: string;
  name: string;
  capacity: number;
  price_per_night_cents: number;
  price_per_night_formatted: string;
  reason: 'UNDER_MAINTENANCE' | 'EXCEEDS_CAPACITY' | 'ALREADY_BOOKED';
  reason_message: string;
  next_available_date?: string | null;
  conflicting_booking?: {
    check_in: string;
    check_out: string;
  } | null;
}

export interface AvailabilityResponse {
  check_in: string;
  check_out: string;
  nights: number;
  currency: 'USD';
  requested_guests: number;
  available_rooms_count: number;
  rooms: AvailableRoom[];
  unavailable_rooms?: UnavailableRoomInfo[];
}

export interface BookingRequest {
  room_id: string;
  customer_name: string;
  customer_email: string;
  check_in: string;
  check_out: string;
  guests: number;
  idempotency_key?: string;
}

export interface BookingConfirmation {
  booking_id: string;
  confirmation_status: 'CONFIRMED';
  is_idempotent_replay: boolean;
  currency: 'USD';
  room: {
    room_id: string;
    name: string;
    capacity: number;
    price_per_night_cents: number;
    price_per_night_formatted: string;
  };
  customer: {
    customer_id: string;
    name: string;
    email: string;
  };
  booking_dates: {
    check_in: string;
    check_out: string;
    nights: number;
    total_price_cents: number;
    total_price_formatted: string;
  };
  created_at: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

export interface ChatToolCall {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  isError: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  toolCalls?: ChatToolCall[];
  booking?: BookingConfirmation | null;
  timestamp: string;
}

export interface ChatApiResponse {
  reply: string;
  toolCalls: ChatToolCall[];
  booking?: BookingConfirmation | null;
  history: ChatTurn[];
}

