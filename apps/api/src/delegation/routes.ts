import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  delegationCreateSchema,
  delegationRevokeSchema,
  isPermissionKey,
  paginationSchema,
  type DelegationDto,
} from '@umu-hr/shared';
import { prisma, type Db } from '../db.js';
import { parseDate, today } from '../dates.js';
import { asyncRoute, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { recordAudit } from '../audit/service.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { hasPermission } from '../access/policy.js';
import { metadata, userDisplayName } from '../phase2/service.js';

const router = Router();

type RouteDb = Db | Prisma.TransactionClient;

const delegationInclude = {
  grantor: { select: { email: true } },
  delegate: { select: { email: true } },
  scopeUnit: { select: { id: true, name: true } },
} satisfies Prisma.DelegationInclude;

type DelegationRow = Prisma.DelegationGetPayload<{ include: typeof delegationInclude }>;

async function toDelegationDto(db: RouteDb, row: DelegationRow): Promise<DelegationDto> {
  return {
    id: row.id,
    grantorUserId: row.grantorUserId,
    grantorName: (await userDisplayName(db, row.grantorUserId)) ?? row.grantor.email,
    delegateUserId: row.delegateUserId,
    delegateName: (await userDisplayName(db, row.delegateUserId)) ?? row.delegate.email,
    permissionKey: row.permissionKey,
    scopeType: row.scopeType,
    scopeUnitId: row.scopeUnitId,
    scopeUnitName: row.scopeUnit?.name ?? null,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    reason: row.reason,
    status: row.status,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

router.get(
  '/',
  requireAuth,
  requirePermission('access.delegate', 'role.manage'),
  asyncRoute(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const where: Prisma.DelegationWhereInput = hasPermission(req.auth!, 'role.manage')
      ? {}
      : {
          OR: [{ grantorUserId: req.auth!.userId }, { delegateUserId: req.auth!.userId }],
        };
    const [rows, total] = await Promise.all([
      prisma.delegation.findMany({
        where,
        include: delegationInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.delegation.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toDelegationDto(prisma, row)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('access.delegate'),
  asyncRoute(async (req, res) => {
    const input = delegationCreateSchema.parse(req.body);
    if (!isPermissionKey(input.permissionKey)) throw badRequest('Unknown permission key');
    if (!req.auth!.permissions.has(input.permissionKey)) {
      throw forbidden('You cannot delegate a permission you do not hold');
    }
    const delegate = await prisma.user.findUnique({
      where: { id: input.delegateUserId },
      select: { id: true },
    });
    if (!delegate) throw notFound('Delegate user not found');
    if (input.scopeUnitId) {
      const unit = await prisma.orgUnit.findUnique({
        where: { id: input.scopeUnitId },
        select: { id: true },
      });
      if (!unit) throw notFound('Scope unit not found');
    }

    const startDate = input.startDate ? parseDate(input.startDate) : today();
    const endDate = input.endDate ? parseDate(input.endDate) : null;

    const delegation = await prisma.$transaction(async (tx) => {
      const created = await tx.delegation.create({
        data: {
          grantorUserId: req.auth!.userId,
          delegateUserId: delegate.id,
          permissionKey: input.permissionKey,
          scopeType: input.scopeType,
          scopeUnitId: input.scopeUnitId ?? null,
          startDate,
          endDate,
          reason: input.reason,
          status: 'ACTIVE',
        },
        include: delegationInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'delegation.created',
          entityType: 'Delegation',
          entityId: created.id,
          reason: input.reason,
          after: {
            delegateUserId: created.delegateUserId,
            permissionKey: created.permissionKey,
            scopeType: created.scopeType,
            scopeUnitId: created.scopeUnitId,
            startDate: created.startDate.toISOString(),
            endDate: created.endDate?.toISOString() ?? null,
          },
        },
        tx,
      );
      return created;
    });
    res.status(201).json(await toDelegationDto(prisma, delegation));
  }),
);

router.post(
  '/:id/revoke',
  requireAuth,
  requirePermission('access.delegate'),
  asyncRoute(async (req, res) => {
    const input = delegationRevokeSchema.parse(req.body);
    const existing = await prisma.delegation.findUnique({
      where: { id: req.params.id as string },
      include: delegationInclude,
    });
    if (!existing) throw notFound('Delegation not found');
    if (existing.grantorUserId !== req.auth!.userId && !hasPermission(req.auth!, 'role.manage')) {
      throw forbidden('Only the grantor or a role manager can revoke this delegation');
    }
    if (existing.status === 'REVOKED') throw conflict('Delegation is already revoked');

    const delegation = await prisma.$transaction(async (tx) => {
      const updated = await tx.delegation.update({
        where: { id: existing.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedById: req.auth!.userId },
        include: delegationInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'delegation.revoked',
          entityType: 'Delegation',
          entityId: updated.id,
          reason: input.reason,
          before: { status: existing.status },
          after: { status: updated.status },
        },
        tx,
      );
      return updated;
    });
    res.json(await toDelegationDto(prisma, delegation));
  }),
);

export default router;
