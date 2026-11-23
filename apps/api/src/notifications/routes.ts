import { Router } from 'express';
import { notificationQuerySchema, type NotificationDto } from '@umu-hr/shared';
import { prisma } from '../db.js';
import { asyncRoute, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth } from '../access/middleware.js';

const router = Router();

function toDto(row: {
  id: string;
  eventType: string;
  title: string;
  safeSummary: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  priority: 'NORMAL' | 'HIGH';
  createdAt: Date;
  readAt: Date | null;
}): NotificationDto {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    safeSummary: row.safeSummary,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

router.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = notificationQuerySchema.parse(req.query);
    const where = {
      recipientUserId: req.auth!.userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    sendPaginated(res, rows.map(toDto), total, query.page, query.pageSize);
  }),
);

router.get(
  '/unread-count',
  requireAuth,
  asyncRoute(async (req, res) => {
    const count = await prisma.notification.count({
      where: { recipientUserId: req.auth!.userId, readAt: null },
    });
    res.json({ count });
  }),
);

router.post(
  '/:id/read',
  requireAuth,
  asyncRoute(async (req, res) => {
    const notification = await prisma.notification.findUnique({ where: { id: (req.params.id as string) } });
    if (!notification || notification.recipientUserId !== req.auth!.userId) {
      throw notFound('Notification not found');
    }
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    res.json(toDto(updated));
  }),
);

router.post(
  '/read-all',
  requireAuth,
  asyncRoute(async (req, res) => {
    await prisma.notification.updateMany({
      where: { recipientUserId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

export default router;
