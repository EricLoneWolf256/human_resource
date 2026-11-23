import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import {
  documentQuerySchema,
  documentRejectSchema,
  documentUploadMetaSchema,
  documentVerifySchema,
  type DocumentDto,
} from '@umu-hr/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { asyncRoute, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { canAccessEmployee, employeeWhere } from '../access/policy.js';
import { recordAudit, auditFields } from '../audit/service.js';
import { notifyPermissionHolders, notifyUsers } from '../notifications/service.js';
import { currentUnitIds, findEmployeeOrThrow } from '../employees/service.js';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';

const router = Router();
const storageDir = isAbsolute(config.STORAGE_DIR)
  ? config.STORAGE_DIR
  : resolve(process.cwd(), config.STORAGE_DIR);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      callback(badRequest('Only PDF, PNG and JPEG files are allowed'));
      return;
    }
    callback(null, true);
  },
});

const MAGIC_BYTES: Record<string, Buffer> = {
  'application/pdf': Buffer.from('%PDF'),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
};

function metadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

function toDto(row: Prisma.DocumentGetPayload<{
  include: {
    employee: { select: { id: true, firstName: true, lastName: true } };
    uploadedBy: { select: { email: true } };
    verifiedBy: { select: { email: true } };
  };
}>): DocumentDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    category: row.category,
    title: row.title,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    sensitivity: row.sensitivity,
    version: row.version,
    expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? null,
    retentionStatus: row.retentionStatus,
    uploadedByName: row.uploadedBy.email,
    uploadedAt: row.createdAt.toISOString(),
    verifiedByName: row.verifiedBy?.email ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationNote: row.verificationNote,
  };
}

const documentInclude = {
  employee: { select: { id: true, firstName: true, lastName: true } },
  uploadedBy: { select: { email: true } },
  verifiedBy: { select: { email: true } },
} satisfies Prisma.DocumentInclude;

async function employeeContextForDocument(employeeId: string) {
  const employee = await findEmployeeOrThrow(employeeId);
  return { id: employee.id, currentUnitIds: currentUnitIds(employee) };
}

router.get(
  '/',
  requireAuth,
  requirePermission('document.view'),
  asyncRoute(async (req, res) => {
    const query = documentQuerySchema.parse(req.query);
    const filters: Prisma.DocumentWhereInput[] = [
      { employee: employeeWhere(req.auth!, 'document.view') },
      { retentionStatus: 'ACTIVE' },
    ];
    if (query.employeeId) {
      const target = await employeeContextForDocument(query.employeeId);
      if (!canAccessEmployee(req.auth!, target, 'document.view')) {
        throw forbidden('This employee is outside your document access scope');
      }
      filters.push({ employeeId: query.employeeId });
    }
    if (query.category) filters.push({ category: query.category });
    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({ OR: [{ title: { contains: query.q } }, { originalFilename: { contains: query.q } }] });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: documentInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.document.count({ where }),
    ]);
    sendPaginated(res, rows.map(toDto), total, query.page, query.pageSize);
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('document.upload'),
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const input = documentUploadMetaSchema.parse(req.body);
    if (!req.file) throw badRequest('A file is required');
    const file = req.file;
    const expectedMagic = MAGIC_BYTES[file.mimetype];
    if (!expectedMagic || !file.buffer.subarray(0, expectedMagic.length).equals(expectedMagic)) {
      throw badRequest('File content does not match the declared file type');
    }

    const employee = await findEmployeeOrThrow(input.employeeId);
    if (!canAccessEmployee(req.auth!, { id: employee.id, currentUnitIds: currentUnitIds(employee) }, 'document.upload')) {
      throw forbidden('This employee is outside your document access scope');
    }

    await mkdir(storageDir, { recursive: true });
    const storageKey = `${randomUUID()}${ALLOWED_TYPES[file.mimetype]}`;
    await writeFile(resolve(storageDir, storageKey), file.buffer, { flag: 'wx' });

    try {
      const document = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            employeeId: employee.id,
            category: input.category,
            title: input.title,
            originalFilename: file.originalname.slice(0, 255),
            storageKey,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sensitivity: input.sensitivity,
            expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00Z`) : null,
            uploadedById: req.auth!.userId,
          },
          include: documentInclude,
        });
        await recordAudit(
          {
            ...metadata(req),
            actorId: req.auth!.userId,
            action: 'document.uploaded',
            entityType: 'Document',
            entityId: created.id,
            after: auditFields(created, ['employeeId', 'category', 'title', 'sensitivity', 'sizeBytes']),
          },
          tx,
        );
        return created;
      });

      await notifyPermissionHolders(prisma, {
        permission: 'document.verify',
        employeeId: employee.id,
        employeeUnitIds: currentUnitIds(employee),
        excludeUserId: req.auth!.userId,
        eventType: 'document.uploaded',
        title: 'Document awaiting verification',
        safeSummary: `A ${input.category.toLowerCase()} document was uploaded for ${employee.staffNumber}.`,
        relatedEntityType: 'Document',
        relatedEntityId: document.id,
      });
      res.status(201).json(toDto(document));
    } catch (error) {
      await unlink(resolve(storageDir, storageKey)).catch(() => undefined);
      throw error;
    }
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const document = await prisma.document.findUnique({
      where: { id: (req.params.id as string) },
      include: documentInclude,
    });
    if (!document) throw notFound('Document not found');
    const target = await employeeContextForDocument(document.employeeId);
    if (!canAccessEmployee(req.auth!, target, 'document.view')) {
      throw forbidden('Document is outside your access scope');
    }
    res.json(toDto(document));
  }),
);

router.get(
  '/:id/download',
  requireAuth,
  requirePermission('document.download'),
  asyncRoute(async (req, res) => {
    const document = await prisma.document.findUnique({
      where: { id: (req.params.id as string) },
      include: documentInclude,
    });
    if (!document) throw notFound('Document not found');
    if (document.retentionStatus !== 'ACTIVE') throw conflict('Document is archived');
    const target = await employeeContextForDocument(document.employeeId);
    if (!canAccessEmployee(req.auth!, target, 'document.download')) {
      throw forbidden('Document is outside your access scope');
    }

    const bytes = await readFile(resolve(storageDir, document.storageKey)).catch(() => null);
    if (!bytes) throw notFound('Document file is missing from storage');

    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'document.downloaded',
      entityType: 'Document',
      entityId: document.id,
      reason: 'Authorized document download',
    });
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalFilename.replace(/"/g, '')}"`);
    res.send(bytes);
  }),
);

router.post(
  '/:id/verify',
  requireAuth,
  requirePermission('document.verify'),
  asyncRoute(async (req, res) => {
    const input = documentVerifySchema.parse(req.body);
    const document = await prisma.document.findUnique({
      where: { id: (req.params.id as string) },
      include: documentInclude,
    });
    if (!document) throw notFound('Document not found');
    const target = await employeeContextForDocument(document.employeeId);
    if (!canAccessEmployee(req.auth!, target, 'document.verify')) {
      throw forbidden('Document is outside your access scope');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.document.update({
        where: { id: document.id },
        data: {
          status: 'VERIFIED',
          verifiedById: req.auth!.userId,
          verifiedAt: new Date(),
          verificationNote: input.note ?? null,
        },
        include: documentInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'document.verified',
          entityType: 'Document',
          entityId: document.id,
          reason: input.note ?? undefined,
          before: { status: document.status },
          after: { status: 'VERIFIED' },
        },
        tx,
      );
      return result;
    });
    const user = await prisma.user.findFirst({
      where: { employeeId: document.employeeId },
      select: { id: true },
    });
    if (user) {
      await notifyUsers(prisma, [user.id], {
        eventType: 'document.verified',
        title: 'Document verified',
        safeSummary: `Your ${document.category.toLowerCase()} document has been verified.`,
        relatedEntityType: 'Document',
        relatedEntityId: document.id,
      });
    }
    res.json(toDto(updated));
  }),
);

router.post(
  '/:id/reject',
  requireAuth,
  requirePermission('document.verify'),
  asyncRoute(async (req, res) => {
    const input = documentRejectSchema.parse(req.body);
    const document = await prisma.document.findUnique({
      where: { id: (req.params.id as string) },
      include: documentInclude,
    });
    if (!document) throw notFound('Document not found');
    const target = await employeeContextForDocument(document.employeeId);
    if (!canAccessEmployee(req.auth!, target, 'document.verify')) {
      throw forbidden('Document is outside your access scope');
    }
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { status: 'REJECTED', verificationNote: input.note, verifiedById: req.auth!.userId, verifiedAt: new Date() },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'document.rejected',
          entityType: 'Document',
          entityId: document.id,
          reason: input.note,
          before: { status: document.status },
          after: { status: 'REJECTED' },
        },
        tx,
      );
    });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('document.delete'),
  asyncRoute(async (req, res) => {
    const input = documentRejectSchema.parse({ note: req.body?.reason ?? 'Document archived' });
    const document = await prisma.document.findUnique({
      where: { id: (req.params.id as string) },
      include: documentInclude,
    });
    if (!document) throw notFound('Document not found');
    const target = await employeeContextForDocument(document.employeeId);
    if (!canAccessEmployee(req.auth!, target, 'document.delete')) {
      throw forbidden('Document is outside your access scope');
    }
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { retentionStatus: 'ARCHIVED' },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'document.archived',
          entityType: 'Document',
          entityId: document.id,
          reason: input.note,
        },
        tx,
      );
    });
    res.json({ ok: true });
  }),
);

export default router;
