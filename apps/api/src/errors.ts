import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorBody } from '@umu-hr/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
export const unauthorized = (message = 'Authentication required', code: string = ERROR_CODES.UNAUTHORIZED) =>
  new ApiError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new ApiError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (message = 'Resource not found') =>
  new ApiError(404, ERROR_CODES.NOT_FOUND, message);
export const conflict = (message: string) => new ApiError(409, ERROR_CODES.CONFLICT, message);
export const invalidTransition = (message: string) =>
  new ApiError(422, ERROR_CODES.INVALID_TRANSITION, message);
export const rateLimited = (message: string, details?: unknown) =>
  new ApiError(429, ERROR_CODES.RATE_LIMITED, message, details);

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Malformed JSON request body' } });
    return;
  }

  const maybePrisma = err as { code?: string; meta?: unknown };
  if (maybePrisma?.code === 'P2002') {
    res.status(409).json({
      error: { code: ERROR_CODES.CONFLICT, message: 'A record with this unique value already exists' },
    });
    return;
  }
  if (maybePrisma?.code === 'P2025') {
    res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Related record not found' } });
    return;
  }

  console.error('Unhandled API error:', err);
  res.status(500).json({ error: { code: ERROR_CODES.INTERNAL, message: 'Internal server error' } });
}
