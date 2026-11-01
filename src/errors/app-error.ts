import { ZodError } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_INACTIVE'
  | 'CAPACITY_EXCEEDED'
  | 'ROOM_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DATABASE_BUSY'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown> | null;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  public static invalidInput(message: string, details: Record<string, unknown> | null = null): AppError {
    return new AppError('INVALID_INPUT', message, details);
  }

  public static roomNotFound(roomId: string): AppError {
    return new AppError('ROOM_NOT_FOUND', `Room with ID '${roomId}' was not found.`, { roomId });
  }

  public static roomInactive(roomId: string, status: string): AppError {
    return new AppError(
      'ROOM_INACTIVE',
      `Room '${roomId}' is currently ${status} and cannot be booked.`,
      { roomId, status }
    );
  }

  public static capacityExceeded(requestedGuests: number, capacity: number): AppError {
    return new AppError(
      'CAPACITY_EXCEEDED',
      `Requested guest count (${requestedGuests}) exceeds room capacity (${capacity}).`,
      { requestedGuests, capacity }
    );
  }

  public static roomUnavailable(roomId: string, checkIn: string, checkOut: string): AppError {
    return new AppError(
      'ROOM_UNAVAILABLE',
      `Room '${roomId}' is already booked for the requested dates [${checkIn} to ${checkOut}).`,
      { roomId, checkIn, checkOut }
    );
  }

  public static idempotencyConflict(key: string): AppError {
    return new AppError(
      'IDEMPOTENCY_CONFLICT',
      `Idempotency key '${key}' was already used with a different booking request.`,
      { idempotency_key: key }
    );
  }

  public static from(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof ZodError) {
      const issueSummary = error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      return new AppError('INVALID_INPUT', `Validation failed: ${issueSummary}`, {
        issues: error.issues
      });
    }

    if (error instanceof Error) {
      if (error.message.includes('SQLITE_BUSY')) {
        return new AppError('DATABASE_BUSY', 'Database write timeout occurred due to contention.', {
          originalMessage: error.message
        });
      }
      return new AppError('INTERNAL_ERROR', error.message);
    }

    return new AppError('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export function toMcpErrorResponse(error: unknown): CallToolResult {
  const appError = AppError.from(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: {
              code: appError.code,
              message: appError.message,
              details: appError.details
            }
          },
          null,
          2
        )
      }
    ]
  };
}
