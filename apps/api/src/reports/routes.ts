import { Router } from 'express';
import { reportPresetCreateSchema, reportQuerySchema, type ReportPresetDto } from '@umu-hr/shared';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { recordAudit } from '../audit/service.js';
import { toDateOnly } from '../dates.js';
import { asyncRoute, notFound } from '../errors.js';
import { metadata } from '../phase2/service.js';
import { prisma } from '../db.js';
import { buildReport, flattenReport } from './service.js';

const router = Router();

function csvCell(value: string | number): string {
  const text = String(value);
  const protectedValue = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

router.get(
  '/',
  requireAuth,
  requirePermission('report.view'),
  asyncRoute(async (req, res) => {
    const query = reportQuerySchema.parse(req.query);
    res.json(await buildReport(req.auth!, query));
  }),
);

router.get(
  '/export',
  requireAuth,
  requirePermission('report.export'),
  asyncRoute(async (req, res) => {
    const query = reportQuerySchema.parse(req.query);
    const report = await buildReport(req.auth!, query);
    const rows = flattenReport(report);
    const lines = [
      `# Generated at: ${csvCell(report.period.generatedAt)}`,
      `# Parameters: from=${csvCell(report.period.from)}; to=${csvCell(report.period.to)}; unit=${csvCell(report.period.unitName ?? 'all')}; scope=${csvCell(report.period.scopeLabel)}`,
      '# Aggregate values only; no employee or applicant identifiers are included',
      'section,metric,value',
      ...rows.map((row) => [row.section, row.metric, row.value].map(csvCell).join(',')),
    ];

    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'report.exported',
      entityType: 'Report',
      reason: 'Aggregated HR report export',
      after: {
        generatedAt: report.period.generatedAt,
        from: report.period.from,
        to: report.period.to,
        unitId: report.period.unitId,
        scopeLabel: report.period.scopeLabel,
        rowCount: rows.length,
      },
    });

    res
      .status(200)
      .type('text/csv')
      .attachment(`hr-report-${toDateOnly(new Date())}.csv`)
      .send(`${lines.join('\r\n')}\r\n`);
  }),
);

function toPresetDto(preset: {
  id: string;
  name: string;
  query: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ReportPresetDto {
  return {
    id: preset.id,
    name: preset.name,
    query: preset.query as ReportPresetDto['query'],
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
  };
}

router.get(
  '/presets',
  requireAuth,
  requirePermission('report.view'),
  asyncRoute(async (req, res) => {
    const presets = await prisma.reportPreset.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(presets.map(toPresetDto));
  }),
);

router.post(
  '/presets',
  requireAuth,
  requirePermission('report.view'),
  asyncRoute(async (req, res) => {
    const input = reportPresetCreateSchema.parse(req.body);
    const preset = await prisma.reportPreset.create({
      data: { userId: req.auth!.userId, name: input.name, query: input.query },
    });
    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'report.preset.created',
      entityType: 'ReportPreset',
      entityId: preset.id,
      after: { name: preset.name, query: input.query },
    });
    res.status(201).json(toPresetDto(preset));
  }),
);

router.delete(
  '/presets/:id',
  requireAuth,
  requirePermission('report.view'),
  asyncRoute(async (req, res) => {
    const presetId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!presetId) throw notFound('Report preset not found');
    const preset = await prisma.reportPreset.findFirst({
      where: { id: presetId, userId: req.auth!.userId },
    });
    if (!preset) throw notFound('Report preset not found');
    await prisma.reportPreset.delete({ where: { id: preset.id } });
    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'report.preset.deleted',
      entityType: 'ReportPreset',
      entityId: preset.id,
      after: { name: preset.name },
    });
    res.json({ ok: true });
  }),
);

export default router;
