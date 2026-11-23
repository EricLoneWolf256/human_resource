import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  deactivateSchema,
  orgUnitCreateSchema,
  orgUnitQuerySchema,
  orgUnitUpdateSchema,
  positionCreateSchema,
  positionQuerySchema,
  positionUpdateSchema,
  type OrgTreeNode,
  type OrgUnitDto,
  type PositionDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { currentAssignmentFilter, canManageOrganization, employeeWhere } from '../access/policy.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { asyncRoute, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { parseDate, today } from '../dates.js';
import { recordAudit, auditFields } from '../audit/service.js';

const router = Router();

async function wouldCreateCycle(unitId: string, parentId: string): Promise<boolean> {
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === unitId || seen.has(cursor)) return true;
    seen.add(cursor);
    const parent: { parentId: string | null } | null = await prisma.orgUnit.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

async function unitDto(id: string): Promise<OrgUnitDto> {
  const unit = await prisma.orgUnit.findUniqueOrThrow({
    where: { id },
    include: {
      parent: { select: { name: true } },
      headEmployee: { select: { firstName: true, lastName: true } },
      _count: {
        select: {
          assignments: { where: { ...currentAssignmentFilter } },
        },
      },
    },
  });
  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    parentId: unit.parentId,
    parentName: unit.parent?.name ?? null,
    headEmployeeId: unit.headEmployeeId,
    headName: unit.headEmployee
      ? `${unit.headEmployee.firstName} ${unit.headEmployee.lastName}`.trim()
      : null,
    status: unit.status,
    effectiveFrom: unit.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: unit.effectiveTo?.toISOString().slice(0, 10) ?? null,
    employeeCount: unit._count.assignments,
  };
}

router.get(
  '/tree',
  requireAuth,
  requirePermission('org.view'),
  asyncRoute(async (_req, res) => {
    const units = await prisma.orgUnit.findMany({
      include: {
        parent: { select: { name: true } },
        headEmployee: { select: { firstName: true, lastName: true } },
        _count: { select: { assignments: { where: { ...currentAssignmentFilter } } } },
      },
      orderBy: { name: 'asc' },
    });
    const nodes = new Map<string, OrgTreeNode>();
    for (const unit of units) {
      nodes.set(unit.id, {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        parentId: unit.parentId,
        parentName: unit.parent?.name ?? null,
        headEmployeeId: unit.headEmployeeId,
        headName: unit.headEmployee
          ? `${unit.headEmployee.firstName} ${unit.headEmployee.lastName}`.trim()
          : null,
        status: unit.status,
        effectiveFrom: unit.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: unit.effectiveTo?.toISOString().slice(0, 10) ?? null,
        employeeCount: unit._count.assignments,
        children: [],
      });
    }
    const roots: OrgTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) nodes.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    res.json(roots);
  }),
);

router.get(
  '/units',
  requireAuth,
  requirePermission('org.view'),
  asyncRoute(async (req, res) => {
    const query = orgUnitQuerySchema.parse(req.query);
    const where: Prisma.OrgUnitWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q } }, { code: { contains: query.q } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.orgUnit.findMany({
        where,
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.orgUnit.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => unitDto(row.id)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/units/:id',
  requireAuth,
  requirePermission('org.view'),
  asyncRoute(async (req, res) => {
    const unit = await prisma.orgUnit.findUnique({ where: { id: (req.params.id as string) } });
    if (!unit) throw notFound('Organizational unit not found');
    const staff = await prisma.employee.findMany({
      where: {
        ...employeeWhere(req.auth!),
        assignments: { some: { unitId: unit.id, ...currentAssignmentFilter } },
      },
      include: {
        assignments: {
          where: { ...currentAssignmentFilter, unitId: unit.id },
          take: 1,
          include: { position: { select: { title: true } } },
        },
      },
      orderBy: { lastName: 'asc' },
      take: 100,
    });
    res.json({
      unit: await unitDto(unit.id),
      staff: staff.map((employee) => ({
        id: employee.id,
        staffNumber: employee.staffNumber,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        employmentStatus: employee.employmentStatus,
        positionTitle: employee.assignments[0]?.position?.title ?? null,
      })),
    });
  }),
);

router.post(
  '/units',
  requireAuth,
  requirePermission('org.manage'),
  asyncRoute(async (req, res) => {
    if (!canManageOrganization(req.auth!)) {
      throw forbidden('Organization management requires institution scope');
    }
    const input = orgUnitCreateSchema.parse(req.body);
    if (input.parentId) {
      const parent = await prisma.orgUnit.findUnique({ where: { id: input.parentId } });
      if (!parent) throw notFound('Parent unit not found');
    }
    if (input.headEmployeeId) {
      const head = await prisma.employee.findUnique({ where: { id: input.headEmployeeId } });
      if (!head) throw notFound('Head employee not found');
    }
    const duplicate = await prisma.orgUnit.findUnique({ where: { code: input.code } });
    if (duplicate) throw conflict('Unit code already exists');

    const unit = await prisma.orgUnit.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        parentId: input.parentId ?? null,
        headEmployeeId: input.headEmployeeId ?? null,
        effectiveFrom: input.effectiveFrom ? parseDate(input.effectiveFrom) : today(),
      },
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: 'org.unit_created',
      entityType: 'OrgUnit',
      entityId: unit.id,
      after: auditFields(unit, ['code', 'name', 'type', 'parentId', 'headEmployeeId']),
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(await unitDto(unit.id));
  }),
);

router.patch(
  '/units/:id',
  requireAuth,
  requirePermission('org.manage'),
  asyncRoute(async (req, res) => {
    if (!canManageOrganization(req.auth!)) throw forbidden('Organization management requires institution scope');
    const input = orgUnitUpdateSchema.parse(req.body);
    const unit = await prisma.orgUnit.findUnique({ where: { id: (req.params.id as string) } });
    if (!unit) throw notFound('Organizational unit not found');
    if (input.parentId) {
      if (await wouldCreateCycle(unit.id, input.parentId)) throw badRequest('Circular parent relationship is not allowed');
    }
    const updated = await prisma.orgUnit.update({
      where: { id: unit.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.headEmployeeId !== undefined ? { headEmployeeId: input.headEmployeeId } : {}),
        ...(input.effectiveFrom ? { effectiveFrom: parseDate(input.effectiveFrom) } : {}),
        ...(input.effectiveTo !== undefined
          ? { effectiveTo: input.effectiveTo ? parseDate(input.effectiveTo) : null }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: 'org.unit_updated',
      entityType: 'OrgUnit',
      entityId: unit.id,
      before: auditFields(unit, ['name', 'type', 'parentId', 'headEmployeeId', 'status']),
      after: auditFields(updated, ['name', 'type', 'parentId', 'headEmployeeId', 'status']),
      ipAddress: req.ip ?? null,
    });
    res.json(await unitDto(unit.id));
  }),
);

router.post(
  '/units/:id/deactivate',
  requireAuth,
  requirePermission('org.manage'),
  asyncRoute(async (req, res) => {
    if (!canManageOrganization(req.auth!)) throw forbidden('Organization management requires institution scope');
    const input = deactivateSchema.parse(req.body);
    const unit = await prisma.orgUnit.findUnique({ where: { id: (req.params.id as string) } });
    if (!unit) throw notFound('Organizational unit not found');
    await prisma.orgUnit.update({
      where: { id: unit.id },
      data: { status: 'INACTIVE', effectiveTo: today() },
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: 'org.unit_deactivated',
      entityType: 'OrgUnit',
      entityId: unit.id,
      reason: input.reason,
      ipAddress: req.ip ?? null,
    });
    res.json({ ok: true });
  }),
);

async function positionDto(id: string): Promise<PositionDto> {
  const position = await prisma.position.findUniqueOrThrow({
    where: { id },
    include: {
      unit: { select: { name: true } },
      _count: { select: { assignments: { where: { ...currentAssignmentFilter } } } },
    },
  });
  return {
    id: position.id,
    code: position.code,
    title: position.title,
    description: position.description,
    grade: position.grade,
    unitId: position.unitId,
    unitName: position.unit.name,
    approvedHeadcount: position.approvedHeadcount,
    filledCount: position._count.assignments,
    status: position.status,
  };
}

router.get(
  '/positions',
  requireAuth,
  requirePermission('org.view'),
  asyncRoute(async (req, res) => {
    const query = positionQuerySchema.parse(req.query);
    const where: Prisma.PositionWhereInput = {
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { code: { contains: query.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.position.findMany({
        where,
        orderBy: { title: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.position.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => positionDto(row.id)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.post(
  '/positions',
  requireAuth,
  requirePermission('org.manage'),
  asyncRoute(async (req, res) => {
    if (!canManageOrganization(req.auth!)) throw forbidden('Organization management requires institution scope');
    const input = positionCreateSchema.parse(req.body);
    const unit = await prisma.orgUnit.findUnique({ where: { id: input.unitId } });
    if (!unit) throw notFound('Organizational unit not found');
    const duplicate = await prisma.position.findUnique({ where: { code: input.code } });
    if (duplicate) throw conflict('Position code already exists');

    const position = await prisma.position.create({
      data: {
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        grade: input.grade ?? null,
        unitId: input.unitId,
        approvedHeadcount: input.approvedHeadcount,
      },
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: 'position.created',
      entityType: 'Position',
      entityId: position.id,
      after: auditFields(position, ['code', 'title', 'grade', 'unitId', 'approvedHeadcount']),
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(await positionDto(position.id));
  }),
);

router.patch(
  '/positions/:id',
  requireAuth,
  requirePermission('org.manage'),
  asyncRoute(async (req, res) => {
    if (!canManageOrganization(req.auth!)) throw forbidden('Organization management requires institution scope');
    const input = positionUpdateSchema.parse(req.body);
    const position = await prisma.position.findUnique({ where: { id: (req.params.id as string) } });
    if (!position) throw notFound('Position not found');
    const updated = await prisma.position.update({
      where: { id: position.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.grade !== undefined ? { grade: input.grade } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
        ...(input.approvedHeadcount ? { approvedHeadcount: input.approvedHeadcount } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: 'position.updated',
      entityType: 'Position',
      entityId: position.id,
      before: auditFields(position, ['title', 'grade', 'unitId', 'approvedHeadcount', 'status']),
      after: auditFields(updated, ['title', 'grade', 'unitId', 'approvedHeadcount', 'status']),
      ipAddress: req.ip ?? null,
    });
    res.json(await positionDto(position.id));
  }),
);

export default router;
