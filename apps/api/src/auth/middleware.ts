import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@umu-hr/shared';
import { prisma } from '../db.js';
import { unauthorized } from '../errors.js';
import { buildAccessContext } from '../access/policy.js';
import type { AuthUserSafe } from './context.js';
import { verifyAccessToken } from './tokens.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(unauthorized());
      return;
    }

    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) {
      next(unauthorized('Session expired. Please sign in again.', ERROR_CODES.UNAUTHORIZED));
      return;
    }

    const session = await prisma.session.findUnique({ where: { id: claims.sessionId } });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      next(unauthorized('Session expired. Please sign in again.', ERROR_CODES.UNAUTHORIZED));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      include: {
        employee: {
          select: { id: true, staffNumber: true, firstName: true, lastName: true, preferredName: true },
        },
      },
    });
    if (!user) {
      next(unauthorized());
      return;
    }
    if (user.status !== 'ACTIVE') {
      next(
        unauthorized(
          user.status === 'SUSPENDED' ? 'Account suspended' : 'Account deactivated',
          user.status === 'SUSPENDED' ? ERROR_CODES.ACCOUNT_SUSPENDED : ERROR_CODES.ACCOUNT_DEACTIVATED,
        ),
      );
      return;
    }

    const authUser: AuthUserSafe = {
      id: user.id,
      email: user.email,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      employeeId: user.employeeId,
      lastLoginAt: user.lastLoginAt,
      employee: user.employee,
    };

    req.auth = await buildAccessContext(
      prisma,
      authUser,
      session.id,
      req.ip ?? null,
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    );
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    next();
  } catch (error) {
    next(error);
  }
};
