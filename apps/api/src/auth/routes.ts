import { Router, type Request, type Response } from 'express';
import { changePasswordSchema, ERROR_CODES, loginSchema } from '@umu-hr/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { asyncRoute, unauthorized } from '../errors.js';
import { toSessionUser } from '../mappers.js';
import { buildAccessContext } from '../access/policy.js';
import { recordAudit } from '../audit/service.js';
import { requireAuth } from '../access/middleware.js';
import type { AuthUserSafe } from './context.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './cookies.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

const router = Router();
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

const employeeSelect = {
  id: true,
  staffNumber: true,
  firstName: true,
  lastName: true,
  preferredName: true,
} as const;

async function loadSafeUser(userId: string): Promise<AuthUserSafe | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      mustChangePassword: true,
      employeeId: true,
      lastLoginAt: true,
      employee: { select: employeeSelect },
    },
  });
  if (!user) return null;
  return {
    ...user,
    status: user.status as AuthUserSafe['status'],
    employee: user.employee
      ? {
          ...user.employee,
          preferredName: user.employee.preferredName ?? null,
        }
      : null,
  };
}

async function createSession(userId: string, req: Request, res: Response): Promise<string> {
  const refreshToken = generateRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    },
  });
  setRefreshCookie(res, refreshToken);
  return signAccessToken(userId, session.id);
}

async function sessionResponse(userId: string, req: Request, res: Response) {
  const safeUser = await loadSafeUser(userId);
  if (!safeUser) throw unauthorized();
  const ctx = await buildAccessContext(prisma, safeUser, '', req.ip ?? null, null);
  return { accessToken: await createSession(userId, req, res), user: toSessionUser(ctx) };
}

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const since = new Date(Date.now() - THROTTLE_WINDOW_MS);

    const failures = await prisma.loginAttempt.count({
      where: { email, success: false, attemptedAt: { gte: since } },
    });
    if (failures >= MAX_FAILED_ATTEMPTS) {
      throw unauthorized('Too many failed sign-in attempts. Try again in 15 minutes.', ERROR_CODES.RATE_LIMITED);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        mustChangePassword: true,
        employeeId: true,
        lastLoginAt: true,
        employee: { select: employeeSelect },
      },
    });

    const passwordValid = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !passwordValid) {
      await prisma.loginAttempt.create({
        data: { email, ipAddress: req.ip ?? null, success: false },
      });
      throw unauthorized('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.status !== 'ACTIVE') {
      await prisma.loginAttempt.create({
        data: { email, ipAddress: req.ip ?? null, success: false },
      });
      throw unauthorized(
        user.status === 'SUSPENDED' ? 'Account suspended' : 'Account deactivated',
        user.status === 'SUSPENDED' ? ERROR_CODES.ACCOUNT_SUSPENDED : ERROR_CODES.ACCOUNT_DEACTIVATED,
      );
    }

    await Promise.all([
      prisma.loginAttempt.create({ data: { email, ipAddress: req.ip ?? null, success: true } }),
      prisma.loginAttempt.deleteMany({ where: { attemptedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    const result = await sessionResponse(user.id, req, res);
    await recordAudit({
      actorId: user.id,
      actorLabel: user.email,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.json(result);
  }),
);

router.post(
  '/refresh',
  asyncRoute(async (req, res) => {
    const token = readRefreshToken(req);
    if (!token) throw unauthorized('No refresh token', ERROR_CODES.UNAUTHORIZED);

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(token) },
    });
    if (!session) throw unauthorized('Invalid refresh token', ERROR_CODES.UNAUTHORIZED);

    if (session.revokedAt) {
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit({
        actorId: session.userId,
        action: 'auth.refresh_token.reuse',
        entityType: 'Session',
        entityId: session.id,
        reason: 'Revoked refresh token presented; all sessions revoked',
        ipAddress: req.ip ?? null,
      });
      clearRefreshCookie(res);
      throw unauthorized('Session reuse detected. Please sign in again.', ERROR_CODES.UNAUTHORIZED);
    }

    if (session.expiresAt <= new Date()) {
      clearRefreshCookie(res);
      throw unauthorized('Session expired. Please sign in again.', ERROR_CODES.UNAUTHORIZED);
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') {
      clearRefreshCookie(res);
      throw unauthorized('Account is not active', ERROR_CODES.ACCOUNT_SUSPENDED);
    }

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const safeUser = await loadSafeUser(user.id);
    if (!safeUser) throw unauthorized();
    const ctx = await buildAccessContext(prisma, safeUser, '', req.ip ?? null, null);
    const accessToken = await createSession(user.id, req, res);
    res.json({ accessToken, user: toSessionUser(ctx) });
  }),
);

router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const token = readRefreshToken(req);
    if (token) {
      const session = await prisma.session.findUnique({
        where: { refreshTokenHash: hashRefreshToken(token) },
      });
      if (session && session.revokedAt === null) {
        await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        await recordAudit({
          actorId: session.userId,
          action: 'auth.logout',
          entityType: 'Session',
          entityId: session.id,
          ipAddress: req.ip ?? null,
        });
      }
    }
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json(toSessionUser(req.auth!));
  }),
);

router.post(
  '/change-password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw unauthorized('Current password is incorrect', ERROR_CODES.INVALID_CREDENTIALS);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
      }),
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      actorId: user.id,
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip ?? null,
    });
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

export default router;
