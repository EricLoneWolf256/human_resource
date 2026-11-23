import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../errors.js';
import { hasPermission } from './policy.js';

export function requirePermission(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (!permissions.some((permission) => hasPermission(req.auth!, permission))) {
      next(forbidden(`Missing required permission: ${permissions.join(' or ')}`));
      return;
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(unauthorized());
    return;
  }
  next();
}
