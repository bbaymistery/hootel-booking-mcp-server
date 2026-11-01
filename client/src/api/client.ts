import type {
  Room,
  AvailabilityResponse,
  BookingRequest,
  BookingConfirmation,
  ApiErrorResponse,
  ChatTurn,
  ChatApiResponse
} from '../types/api.ts';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | null;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown> | null) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = `HTTP Error ${res.status}`;
    let details: Record<string, unknown> | null = null;

    try {
      const errorJson = (await res.json()) as ApiErrorResponse;
      if (errorJson.error) {
        errorCode = errorJson.error.code;
        errorMessage = errorJson.error.message;
        details = errorJson.error.details ?? null;
      }
    } catch {
      // Non-JSON response
    }

    throw new ApiClientError(res.status, errorCode, errorMessage, details);
  }

  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string; database: string }> {
  const res = await fetch('/api/health');
  return handleResponse<{ status: string; database: string }>(res);
}

export async function fetchCatalogRooms(): Promise<Room[]> {
  const res = await fetch('/api/rooms');
  const data = await handleResponse<{ rooms: Room[] }>(res);
  return data.rooms;
}

export async function checkAvailability(
  checkIn: string,
  checkOut: string,
  guests: number
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    check_in: checkIn,
    check_out: checkOut,
    guests: String(guests)
  });

  const res = await fetch(`/api/availability?${params.toString()}`);
  return handleResponse<AvailabilityResponse>(res);
}

export async function createBooking(
  request: BookingRequest,
  idempotencyKey?: string
): Promise<BookingConfirmation> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...request,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
    })
  });

  return handleResponse<BookingConfirmation>(res);
}

export async function sendChatMessage(
  message: string,
  history?: ChatTurn[],
  model?: string
): Promise<ChatApiResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      ...(history && history.length > 0 ? { history } : {}),
      ...(model ? { model } : {})
    })
  });

  return handleResponse<ChatApiResponse>(res);
}
