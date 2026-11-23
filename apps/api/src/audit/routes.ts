import { Router } from 'express';
import { auditQuerySchema, type AuditEventDto } from '@umu-hr/shared';
import { prisma } from '../db.js';
import { asyncRoute } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { parseDate } from '../dates.js';

const router = Router();

router.get(
  '/audit',
  requireAuth,
  requirePermission('audit.view'),
  asyncRoute(async (req, res) => {
    const query = auditQuerySchema.parse(req.query);
    const where = {
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.entityType ? { entityType: { contains: query.entityType } } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: parseDate(query.from) } : {}),
              ...(query.to ? { lte: parseDate(query.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    const items: AuditEventDto[] = rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actor?.email ?? row.actorLabel ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      reason: row.reason,
      before: (row.before as Record<string, unknown> | null) ?? null,
      after: (row.after as Record<string, unknown> | null) ?? null,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    }));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

export default router;
