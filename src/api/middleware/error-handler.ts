import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message
    }));
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Validation failed for request parameters.',
        details: { issues }
      }
    });
    return;
  }

  if (err instanceof AppError) {
    let statusCode = 500;
    switch (err.code) {
      case 'INVALID_INPUT':
      case 'CAPACITY_EXCEEDED':
        statusCode = 400;
        break;
      case 'ROOM_NOT_FOUND':
        statusCode = 404;
        break;
      case 'ROOM_INACTIVE':
        statusCode = 422;
        break;
      case 'ROOM_UNAVAILABLE':
      case 'IDEMPOTENCY_CONFLICT':
        statusCode = 409;
        break;
      case 'DATABASE_BUSY':
        statusCode = 503;
        break;
      default:
        statusCode = 500;
    }

    res.status(statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  console.error('[API Error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message
    }
  });
}
