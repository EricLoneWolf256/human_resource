import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { prisma } from './db.js';
import { asyncRoute, errorHandler, notFound } from './errors.js';
import { authenticate } from './auth/middleware.js';
import authRouter from './auth/routes.js';
import accessRouter from './access/routes.js';
import auditRouter from './audit/routes.js';
import orgRouter from './org/routes.js';
import employeesRouter, { changeRequestRouter } from './employees/routes.js';
import documentsRouter from './documents/routes.js';
import notificationsRouter from './notifications/routes.js';
import dashboardRouter from './dashboard/routes.js';
import leaveRouter from './leave/routes.js';
import requestsRouter from './requests/routes.js';
import contractsRouter from './contracts/routes.js';
import onboardingRouter from './onboarding/routes.js';
import remindersRouter from './reminders/routes.js';
import delegationRouter from './delegation/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
      } catch {
        res.status(503).json({ status: 'error', database: 'unavailable' });
      }
    }),
  );

  const publicApiPaths = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);
  app.use('/api', (req, res, next) => {
    if (publicApiPaths.has(req.path)) {
      next();
      return;
    }
    authenticate(req, res, next);
  });

  app.use('/api/auth', authRouter);
  app.use('/api/access', accessRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/change-requests', changeRequestRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/leave', leaveRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/reminders', remindersRouter);
  app.use('/api/delegations', delegationRouter);
  app.use('/api', auditRouter);

  app.use('/api', (_req, _res, next) => next(notFound('Endpoint not found')));
  app.use(errorHandler);
  return app;
}
