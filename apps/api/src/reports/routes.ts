import { Router } from 'express';
import { reportQuerySchema } from '@umu-hr/shared';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { recordAudit } from '../audit/service.js';
import { toDateOnly } from '../dates.js';
import { asyncRoute } from '../errors.js';
import { metadata } from '../phase2/service.js';
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

export default router;
