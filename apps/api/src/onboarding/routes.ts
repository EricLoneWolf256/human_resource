import { Router } from 'express';
import type { OnboardingTask, Prisma } from '@prisma/client';
import {
  onboardingChecklistCreateSchema,
  onboardingTaskCreateSchema,
  onboardingTaskUpdateSchema,
  onboardingTemplateCreateSchema,
  paginationSchema,
  type OnboardingChecklistDto,
  type OnboardingTaskDto,
  type OnboardingTemplateDto,
} from '@umu-hr/shared';
import { prisma, type Db } from '../db.js';
import { addDays, parseDate, today } from '../dates.js';
import { asyncRoute, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { hasPermission } from '../access/policy.js';
import {
  accessibleEmployeeWhere,
  employeeName,
  metadata,
  requireEmployeeInScope,
  userDisplayName,
} from '../phase2/service.js';

const router = Router();

type RouteDb = Db | Prisma.TransactionClient;

const checklistInclude = {
  employee: { select: { id: true, firstName: true, lastName: true } },
  template: { select: { id: true, name: true } },
  tasks: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.OnboardingChecklistInclude;

type ChecklistRow = Prisma.OnboardingChecklistGetPayload<{ include: typeof checklistInclude }>;
type TemplateRow = Prisma.OnboardingTemplateGetPayload<{ include: { tasks: true } }>;

function toTemplateDto(row: TemplateRow): OnboardingTemplateDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    tasks: row.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      ownerRoleKey: task.ownerRoleKey,
      dueOffsetDays: task.dueOffsetDays,
      isRequired: task.isRequired,
      sortOrder: task.sortOrder,
    })),
  };
}

async function toTaskDto(db: RouteDb, row: OnboardingTask): Promise<OnboardingTaskDto> {
  return {
    id: row.id,
    checklistId: row.checklistId,
    templateTaskId: row.templateTaskId,
    title: row.title,
    description: row.description,
    ownerUserId: row.ownerUserId,
    ownerName: await userDisplayName(db, row.ownerUserId),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    status: row.status,
    comment: row.comment,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    sortOrder: row.sortOrder,
  };
}

async function toChecklistDto(db: RouteDb, row: ChecklistRow): Promise<OnboardingChecklistDto> {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    templateId: row.templateId,
    templateName: row.template.name,
    status: row.status,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    tasks: await Promise.all(row.tasks.map((task) => toTaskDto(db, task))),
  };
}

router.get(
  '/templates',
  requireAuth,
  requirePermission('onboarding.view'),
  asyncRoute(async (_req, res) => {
    const templates = await prisma.onboardingTemplate.findMany({
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(templates.map((template) => toTemplateDto(template)));
  }),
);

router.post(
  '/templates',
  requireAuth,
  requirePermission('onboarding.manage'),
  asyncRoute(async (req, res) => {
    const input = onboardingTemplateCreateSchema.parse(req.body);
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.onboardingTemplate.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          tasks: {
            create: input.tasks.map((task) => ({
              title: task.title,
              description: task.description ?? null,
              ownerRoleKey: task.ownerRoleKey,
              dueOffsetDays: task.dueOffsetDays,
              isRequired: task.isRequired,
              sortOrder: task.sortOrder,
            })),
          },
        },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'onboarding.template_created',
          entityType: 'OnboardingTemplate',
          entityId: created.id,
          after: { code: created.code, name: created.name, taskCount: created.tasks.length },
        },
        tx,
      );
      return created;
    });
    res.status(201).json(toTemplateDto(template));
  }),
);

router.post(
  '/checklists',
  requireAuth,
  requirePermission('onboarding.manage'),
  asyncRoute(async (req, res) => {
    const input = onboardingChecklistCreateSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, input.employeeId, 'onboarding.view');
    const template = await prisma.onboardingTemplate.findUnique({
      where: { id: input.templateId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw notFound('Onboarding template not found');

    const baseDate = employee.hireDate ?? today();
    const maxOffset = template.tasks.reduce((max, task) => Math.max(max, task.dueOffsetDays), 0);
    const dueDate = input.dueDate ? parseDate(input.dueDate) : addDays(baseDate, maxOffset);

    const checklist = await prisma.$transaction(async (tx) => {
      const created = await tx.onboardingChecklist.create({
        data: {
          employeeId: employee.id,
          templateId: template.id,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          dueDate,
          tasks: {
            create: template.tasks.map((task) => ({
              templateTaskId: task.id,
              title: task.title,
              description: task.description,
              dueDate: addDays(baseDate, task.dueOffsetDays),
              sortOrder: task.sortOrder,
              status: 'PENDING',
            })),
          },
        },
        include: checklistInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'onboarding.checklist_created',
          entityType: 'OnboardingChecklist',
          entityId: created.id,
          after: {
            employeeId: employee.id,
            templateId: template.id,
            taskCount: template.tasks.length,
          },
        },
        tx,
      );
      const linkedUser = await tx.user.findUnique({
        where: { employeeId: employee.id },
        select: { id: true },
      });
      if (linkedUser) {
        await notifyUsers(tx, [linkedUser.id], {
          eventType: 'onboarding.checklist_created',
          title: 'Onboarding checklist started',
          safeSummary: `An onboarding checklist from ${template.name} has been started for you.`,
          relatedEntityType: 'OnboardingChecklist',
          relatedEntityId: created.id,
        });
      }
      return created;
    });
    res.status(201).json(await toChecklistDto(prisma, checklist));
  }),
);

router.get(
  '/checklists',
  requireAuth,
  requirePermission('onboarding.view'),
  asyncRoute(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const where: Prisma.OnboardingChecklistWhereInput = {
      employee: accessibleEmployeeWhere(req, 'onboarding.view'),
    };
    const [rows, total] = await Promise.all([
      prisma.onboardingChecklist.findMany({
        where,
        include: checklistInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.onboardingChecklist.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toChecklistDto(prisma, row)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.patch(
  '/tasks/:id',
  requireAuth,
  requirePermission('onboarding.view'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const existing = await prisma.onboardingTask.findUnique({
      where: { id },
      include: { checklist: true, templateTask: true },
    });
    if (!existing) throw notFound('Onboarding task not found');

    if (existing.checklist.employeeId !== req.auth!.employeeId) {
      if (!hasPermission(req.auth!, 'onboarding.manage')) {
        throw forbidden('You cannot update this onboarding task');
      }
      await requireEmployeeInScope(req, existing.checklist.employeeId, 'onboarding.manage');
    }

    const input = onboardingTaskUpdateSchema.parse(req.body);
    const completed = input.status === 'COMPLETED';
    const data: Prisma.OnboardingTaskUncheckedUpdateInput = {
      status: input.status,
      completedAt: completed ? new Date() : null,
      completedById: completed ? req.auth!.userId : null,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? parseDate(input.dueDate) : null } : {}),
    };

    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.onboardingTask.update({ where: { id }, data });
      const tasks = await tx.onboardingTask.findMany({
        where: { checklistId: updated.checklistId },
        select: { status: true, templateTask: { select: { isRequired: true } } },
      });
      const required = tasks.filter((row) => row.templateTask?.isRequired === true);
      const gating = required.length > 0 ? required : tasks;
      const allDone = gating.every((row) => row.status === 'COMPLETED');
      await tx.onboardingChecklist.update({
        where: { id: updated.checklistId },
        data: allDone
          ? { status: 'COMPLETED', completedAt: new Date() }
          : { status: 'IN_PROGRESS', completedAt: null },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'onboarding.task_updated',
          entityType: 'OnboardingTask',
          entityId: updated.id,
          after: {
            status: updated.status,
            comment: updated.comment,
            ownerUserId: updated.ownerUserId,
            checklistStatus: allDone ? 'COMPLETED' : 'IN_PROGRESS',
          },
        },
        tx,
      );
      return updated;
    });
    res.json(await toTaskDto(prisma, task));
  }),
);

router.post(
  '/checklists/:id/tasks',
  requireAuth,
  requirePermission('onboarding.manage'),
  asyncRoute(async (req, res) => {
    const checklist = await prisma.onboardingChecklist.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, employeeId: true },
    });
    if (!checklist) throw notFound('Onboarding checklist not found');
    await requireEmployeeInScope(req, checklist.employeeId, 'onboarding.manage');

    const input = onboardingTaskCreateSchema.parse(req.body);
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.onboardingTask.create({
        data: {
          checklistId: checklist.id,
          title: input.title,
          description: input.description ?? null,
          ownerUserId: input.ownerUserId ?? null,
          dueDate: input.dueDate ? parseDate(input.dueDate) : null,
          sortOrder: input.sortOrder,
          status: 'PENDING',
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'onboarding.task_added',
          entityType: 'OnboardingTask',
          entityId: created.id,
          after: {
            checklistId: created.checklistId,
            title: created.title,
            sortOrder: created.sortOrder,
          },
        },
        tx,
      );
      return created;
    });
    res.status(201).json(await toTaskDto(prisma, task));
  }),
);

export default router;
