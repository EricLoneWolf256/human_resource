import type { Prisma } from '@prisma/client';
import type { OperationsReportDto, ReportPayload, ReportQuery } from '@umu-hr/shared';
import type { AuthContext } from '../auth/context.js';
import {
  currentAssignmentFilter,
  effectiveGrantsFor,
  employeeWhere,
  hasPermission,
} from '../access/policy.js';
import { addDays, endOfDay, parseDate, toDateOnly, today } from '../dates.js';
import { prisma } from '../db.js';

const ACADEMIC_UNIT_TYPES = new Set(['FACULTY', 'SCHOOL', 'DEPARTMENT']);
const DAY_MS = 86_400_000;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function countMap(rows: Array<[string, number]>): Record<string, number> {
  return Object.fromEntries(rows);
}

function reportScopeLabel(ctx: AuthContext): string {
  const grants = effectiveGrantsFor(ctx, 'report.view');
  if (grants.some((grant) => grant.all)) return 'Institution';
  const unitGrant = grants.find((grant) => grant.scopeUnitName);
  if (unitGrant?.scopeUnitName) return `${unitGrant.scopeType}: ${unitGrant.scopeUnitName}`;
  if (grants.some((grant) => grant.scopeType === 'TEAM')) return 'Direct reports';
  if (grants.some((grant) => grant.scopeType === 'OWN')) return 'Own records';
  return 'None';
}

function reportEmployeeWhere(ctx: AuthContext, query: ReportQuery): Prisma.EmployeeWhereInput {
  const filters: Prisma.EmployeeWhereInput[] = [employeeWhere(ctx, 'report.view')];
  if (query.unitId) {
    filters.push({
      assignments: { some: { unitId: query.unitId, ...currentAssignmentFilter } },
    });
  }
  return { AND: filters };
}

function reportVacancyWhere(ctx: AuthContext, query: ReportQuery): Prisma.VacancyWhereInput {
  const filters: Prisma.VacancyWhereInput[] = [];
  const grants = effectiveGrantsFor(ctx, 'report.view');
  if (!grants.some((grant) => grant.all)) {
    const unitIds = [...new Set(grants.flatMap((grant) => grant.scopeUnitIds))];
    filters.push(unitIds.length > 0 ? { unitId: { in: unitIds } } : { id: '__no_scope__' });
  }
  if (query.unitId) filters.push({ unitId: query.unitId });
  return { AND: filters };
}

function restrictedVisibility(ctx: AuthContext): Prisma.HrRequestWhereInput {
  const allowed = [
    'complaint.view_assigned',
    'complaint.assign',
    'complaint.investigate',
    'complaint.close',
  ].some((permission) => hasPermission(ctx, permission));
  if (allowed) return {};
  return {
    OR: [
      { sensitivity: { not: 'HIGHLY_RESTRICTED' } },
      { sensitivity: 'HIGHLY_RESTRICTED', assignedToUserId: ctx.userId },
    ],
  };
}

export async function buildReport(ctx: AuthContext, input: ReportQuery): Promise<ReportPayload> {
  const query: ReportQuery = {
    from: input.from ?? toDateOnly(addDays(today(), -365)),
    to: input.to ?? toDateOnly(today()),
    unitId: input.unitId ?? undefined,
  };
  const fromDate = parseDate(query.from!);
  const toDate = parseDate(query.to!);
  const toEnd = endOfDay(toDate);
  const employeeScope = reportEmployeeWhere(ctx, query);
  const vacancyScope = reportVacancyWhere(ctx, query);
  const requestWhere: Prisma.HrRequestWhereInput = {
    AND: [
      { requester: employeeScope },
      { createdAt: { gte: fromDate, lte: toEnd } },
      restrictedVisibility(ctx),
    ],
  };
  const governanceAccess = ['audit.view', 'user.manage', 'role.manage', 'access.delegate'].some((permission) =>
    effectiveGrantsFor(ctx, permission).some((grant) => grant.all),
  );

  const [
    total,
    byStatusRows,
    byEmploymentTypeRows,
    hires,
    exits,
    assignmentRows,
    leaveStatusRows,
    leaveTypeRows,
    approvedLeave,
    leaveByTypeRows,
    pendingLeave,
    expiringContracts,
    renewalRows,
    requestCategoryRows,
    requestStatusRows,
    openRequests,
    resolvedRequests,
    onboardingRows,
    probationPending,
    appraisalRows,
    appraisalsWithCycles,
    trainingRecords,
    trainingRequests,
    certificateTraining,
    certificateSkills,
    publishedVacancies,
    applications,
    applicationStatusRows,
    offeredApplications,
    activeRoleAssignments,
    expiringRoleAssignments30Days,
    activeDelegations,
    expiringDelegations30Days,
    auditEvents,
    reportExports,
    selectedUnit,
  ] = await Promise.all([
    prisma.employee.count({ where: employeeScope }),
    prisma.employee.groupBy({ by: ['employmentStatus'], where: employeeScope, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ['employmentType'], where: employeeScope, _count: { _all: true } }),
    prisma.employee.count({ where: { AND: [employeeScope, { hireDate: { gte: fromDate, lte: toDate } }] } }),
    prisma.employee.count({ where: { AND: [employeeScope, { endDate: { gte: fromDate, lte: toDate } }] } }),
    prisma.employeeAssignment.findMany({
      where: { employee: employeeScope, ...currentAssignmentFilter },
      select: {
        employeeId: true,
        unit: { select: { id: true, name: true, type: true } },
        position: { select: { grade: true } },
      },
    }),
    prisma.leaveRequest.groupBy({ by: ['status'], where: { employee: employeeScope }, _count: { _all: true } }),
    prisma.leaveType.findMany({ select: { id: true, name: true } }),
    prisma.leaveRequest.aggregate({
      where: {
        AND: [
          { employee: employeeScope },
          { status: 'APPROVED' },
          { submittedAt: { gte: fromDate, lte: toEnd } },
        ],
      },
      _sum: { daysRequested: true },
    }),
    prisma.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: { AND: [{ employee: employeeScope }, { submittedAt: { gte: fromDate, lte: toEnd } }] },
      _count: { _all: true },
    }),
    prisma.leaveRequest.count({
      where: {
        AND: [
          { employee: employeeScope },
          { status: { in: ['SUBMITTED', 'PENDING_HR'] } },
        ],
      },
    }),
    prisma.contract.count({
      where: {
        AND: [
          { employee: employeeScope },
          { status: 'ACTIVE' },
          { endDate: { gte: today(), lte: addDays(today(), 30) } },
        ],
      },
    }),
    prisma.contract.groupBy({
      by: ['renewalStatus'],
      where: { employee: employeeScope },
      _count: { _all: true },
    }),
    prisma.hrRequest.groupBy({ by: ['category'], where: requestWhere, _count: { _all: true } }),
    prisma.hrRequest.groupBy({ by: ['status'], where: requestWhere, _count: { _all: true } }),
    prisma.hrRequest.count({
      where: { AND: [requestWhere, { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }] },
    }),
    prisma.hrRequest.findMany({
      where: { AND: [requestWhere, { resolvedAt: { gte: fromDate, lte: toEnd } }] },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.onboardingChecklist.groupBy({ by: ['status'], where: { employee: employeeScope }, _count: { _all: true } }),
    prisma.probationRecord.count({
      where: { AND: [{ employee: employeeScope }, { outcome: 'PENDING' }] },
    }),
    prisma.appraisal.groupBy({ by: ['status'], where: { employee: employeeScope }, _count: { _all: true } }),
    prisma.appraisal.findMany({
      where: { employee: employeeScope },
      select: { status: true, cycle: { select: { endDate: true } } },
    }),
    prisma.trainingRecord.count({
      where: { AND: [{ employee: employeeScope }, { completedAt: { gte: fromDate, lte: toEnd } }] },
    }),
    prisma.trainingRequest.count({
      where: {
        AND: [
          { employee: employeeScope },
          { status: { in: ['APPROVED', 'REGISTERED', 'COMPLETED'] } },
          { createdAt: { gte: fromDate, lte: toEnd } },
        ],
      },
    }),
    prisma.trainingRecord.count({
      where: {
        AND: [
          { employee: employeeScope },
          { expiryDate: { gte: today(), lte: addDays(today(), 90) } },
        ],
      },
    }),
    prisma.employeeSkill.count({
      where: {
        AND: [
          { employee: employeeScope },
          { expiryDate: { gte: today(), lte: addDays(today(), 90) } },
        ],
      },
    }),
    prisma.vacancy.count({ where: { AND: [vacancyScope, { status: { in: ['PUBLISHED', 'FILLED'] } }] } }),
    prisma.application.count({
      where: {
        AND: [{ vacancy: vacancyScope }, { submittedAt: { gte: fromDate, lte: toEnd } }],
      },
    }),
    prisma.application.groupBy({
      by: ['status'],
      where: { AND: [{ vacancy: vacancyScope }, { submittedAt: { gte: fromDate, lte: toEnd } }] },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: {
        AND: [
          { vacancy: vacancyScope },
          { offeredAt: { gte: fromDate, lte: toEnd } },
          { status: { in: ['OFFERED', 'ACCEPTED', 'DECLINED'] } },
        ],
      },
      select: {
        offeredAt: true,
        vacancy: { select: { publishedAt: true, createdAt: true } },
      },
    }),
    governanceAccess
      ? prisma.roleAssignment.count({
          where: {
            revokedAt: null,
            startDate: { lte: today() },
            OR: [{ endDate: null }, { endDate: { gte: today() } }],
          },
        })
      : Promise.resolve(null),
    governanceAccess
      ? prisma.roleAssignment.count({
          where: {
            revokedAt: null,
            startDate: { lte: today() },
            endDate: { gte: today(), lte: addDays(today(), 30) },
          },
        })
      : Promise.resolve(null),
    governanceAccess
      ? prisma.delegation.count({
          where: {
            status: 'ACTIVE',
            revokedAt: null,
            startDate: { lte: today() },
            OR: [{ endDate: null }, { endDate: { gte: today() } }],
          },
        })
      : Promise.resolve(null),
    governanceAccess
      ? prisma.delegation.count({
          where: {
            status: 'ACTIVE',
            revokedAt: null,
            startDate: { lte: today() },
            endDate: { gte: today(), lte: addDays(today(), 30) },
          },
        })
      : Promise.resolve(null),
    governanceAccess
      ? prisma.auditEvent.count({ where: { createdAt: { gte: fromDate, lte: toEnd } } })
      : Promise.resolve(null),
    governanceAccess
      ? prisma.auditEvent.count({
          where: { action: { startsWith: 'report.export' }, createdAt: { gte: fromDate, lte: toEnd } },
        })
      : Promise.resolve(null),
    query.unitId
      ? prisma.orgUnit.findUnique({ where: { id: query.unitId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const unitCounts = new Map<string, { name: string; count: number }>();
  const gradeCounts = new Map<string, number>();
  const countedByUnit = new Set<string>();
  const countedByGrade = new Set<string>();
  const countedForCategory = new Set<string>();
  let academic = 0;
  let nonAcademic = 0;

  for (const assignment of assignmentRows) {
    const unit = assignment.unit;
    const unitKey = `${assignment.employeeId}:${unit.id}`;
    if (!countedByUnit.has(unitKey)) {
      countedByUnit.add(unitKey);
      const existing = unitCounts.get(unit.id) ?? { name: unit.name, count: 0 };
      existing.count += 1;
      unitCounts.set(unit.id, existing);
    }
    if (!countedForCategory.has(assignment.employeeId)) {
      countedForCategory.add(assignment.employeeId);
      if (ACADEMIC_UNIT_TYPES.has(unit.type)) academic += 1;
      else nonAcademic += 1;
    }
    const grade = assignment.position?.grade ?? 'UNASSIGNED';
    const gradeKey = `${assignment.employeeId}:${grade}`;
    if (!countedByGrade.has(gradeKey)) {
      countedByGrade.add(gradeKey);
      gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
    }
  }

  const leaveTypeNames = new Map(leaveTypeRows.map((row) => [row.id, row.name]));
  const onboardingCount = (status: string) =>
    onboardingRows.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
  const appraisalCount = (status: string) =>
    appraisalRows.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
  const finalAppraisals = appraisalCount('FINALIZED') + appraisalCount('ARCHIVED');
  const overdueAppraisals = appraisalsWithCycles.filter(
    (appraisal) =>
      appraisal.cycle.endDate < today() &&
      appraisal.status !== 'FINALIZED' &&
      appraisal.status !== 'ARCHIVED',
  ).length;

  const operations: OperationsReportDto = {
    leaveByStatus: countMap(
      leaveStatusRows.map((row) => [row.status, row._count._all]),
    ),
    leaveByType: leaveByTypeRows.map((row) => ({
      label: leaveTypeNames.get(row.leaveTypeId) ?? 'Unknown leave type',
      count: row._count._all,
    })),
    leaveDaysApproved: approvedLeave._sum.daysRequested ?? 0,
    pendingLeave,
    contractsExpiring30Days: expiringContracts,
    contractsByRenewalStatus: countMap(
      renewalRows.map((row) => [row.renewalStatus, row._count._all]),
    ),
    requestsByCategory: requestCategoryRows.map((row) => ({ label: row.category, count: row._count._all })),
    requestsByStatus: countMap(requestStatusRows.map((row) => [row.status, row._count._all])),
    openRequests,
    averageRequestResolutionDays: average(
      resolvedRequests
        .filter((row) => row.resolvedAt !== null)
        .map((row) => (row.resolvedAt!.getTime() - row.createdAt.getTime()) / DAY_MS),
    ),
    onboardingCompletion: {
      completed: onboardingCount('COMPLETED'),
      total: onboardingRows.reduce((sum, row) => sum + row._count._all, 0),
    },
    probationPending,
    appraisalCompletion: {
      completed: finalAppraisals,
      total: appraisalRows.reduce((sum, row) => sum + row._count._all, 0),
    },
    overdueAppraisals,
    trainingCompletion: { completed: trainingRecords, total: trainingRequests },
    certificatesExpiring90Days: certificateTraining + certificateSkills,
    vacanciesPublished: publishedVacancies,
    applicationsReceived: applications,
    applicationsByStatus: countMap(
      applicationStatusRows.map((row) => [row.status, row._count._all]),
    ),
    averageTimeToFillDays: average(
      offeredApplications
        .filter((row) => row.offeredAt !== null)
        .map((row) => {
          const start = row.vacancy.publishedAt ?? row.vacancy.createdAt;
          return (row.offeredAt!.getTime() - start.getTime()) / DAY_MS;
        }),
    ),
  };

  return {
    period: {
      from: query.from!,
      to: query.to!,
      unitId: query.unitId ?? null,
      unitName: selectedUnit?.name ?? null,
      generatedAt: new Date().toISOString(),
      scopeLabel: reportScopeLabel(ctx),
    },
    workforce: {
      total,
      byStatus: countMap(byStatusRows.map((row) => [row.employmentStatus, row._count._all])),
      byEmploymentType: countMap(
        byEmploymentTypeRows.map((row) => [row.employmentType, row._count._all]),
      ),
      byUnit: [...unitCounts.values()].map((value) => ({ label: value.name, count: value.count })),
      byGrade: [...gradeCounts.entries()].map(([label, count]) => ({ label, count })),
      academic: { academic, nonAcademic },
      hires,
      exits,
    },
    operations,
    governance: {
      activeRoleAssignments,
      expiringRoleAssignments30Days,
      activeDelegations,
      expiringDelegations30Days,
      auditEvents,
      reportExports,
    },
  };
}

export interface ReportRow {
  section: string;
  metric: string;
  value: string | number;
}

export function flattenReport(report: ReportPayload): ReportRow[] {
  const rows: ReportRow[] = [];
  const addMap = (section: string, values: Record<string, number>) => {
    for (const [label, count] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
      rows.push({ section, metric: label, value: count });
    }
  };
  const addList = (section: string, values: Array<{ label: string; count: number }>) => {
    for (const value of values) rows.push({ section, metric: value.label, value: value.count });
  };

  addMap('Workforce by status', report.workforce.byStatus);
  addMap('Workforce by employment type', report.workforce.byEmploymentType);
  addList('Workforce by unit', report.workforce.byUnit);
  addList('Workforce by grade', report.workforce.byGrade);
  rows.push({ section: 'Workforce', metric: 'Total headcount', value: report.workforce.total });
  rows.push({ section: 'Workforce', metric: 'Academic staff', value: report.workforce.academic.academic });
  rows.push({ section: 'Workforce', metric: 'Non-academic staff', value: report.workforce.academic.nonAcademic });
  rows.push({ section: 'Workforce', metric: 'Hires in period', value: report.workforce.hires });
  rows.push({ section: 'Workforce', metric: 'Exits in period', value: report.workforce.exits });

  addMap('Leave by status', report.operations.leaveByStatus);
  addList('Leave by type', report.operations.leaveByType);
  addMap('Contracts by renewal status', report.operations.contractsByRenewalStatus);
  addList('Requests by category', report.operations.requestsByCategory);
  addMap('Requests by status', report.operations.requestsByStatus);
  addMap('Applications by status', report.operations.applicationsByStatus);
  rows.push({ section: 'Operations', metric: 'Approved leave days', value: report.operations.leaveDaysApproved });
  rows.push({ section: 'Operations', metric: 'Pending leave requests', value: report.operations.pendingLeave });
  rows.push({ section: 'Operations', metric: 'Contracts expiring in 30 days', value: report.operations.contractsExpiring30Days });
  rows.push({ section: 'Operations', metric: 'Open HR requests', value: report.operations.openRequests });
  rows.push({
    section: 'Operations',
    metric: 'Average request resolution days',
    value: report.operations.averageRequestResolutionDays ?? 'n/a',
  });
  rows.push({
    section: 'Operations',
    metric: 'Onboarding completed',
    value: report.operations.onboardingCompletion.completed,
  });
  rows.push({
    section: 'Operations',
    metric: 'Onboarding total',
    value: report.operations.onboardingCompletion.total,
  });
  rows.push({ section: 'Operations', metric: 'Pending probation reviews', value: report.operations.probationPending });
  rows.push({
    section: 'Operations',
    metric: 'Appraisals finalized',
    value: report.operations.appraisalCompletion.completed,
  });
  rows.push({
    section: 'Operations',
    metric: 'Appraisals total',
    value: report.operations.appraisalCompletion.total,
  });
  rows.push({ section: 'Operations', metric: 'Overdue appraisals', value: report.operations.overdueAppraisals });
  rows.push({
    section: 'Operations',
    metric: 'Training records completed',
    value: report.operations.trainingCompletion.completed,
  });
  rows.push({
    section: 'Operations',
    metric: 'Training requests active',
    value: report.operations.trainingCompletion.total,
  });
  rows.push({
    section: 'Operations',
    metric: 'Certificates expiring in 90 days',
    value: report.operations.certificatesExpiring90Days,
  });
  rows.push({ section: 'Operations', metric: 'Vacancies published', value: report.operations.vacanciesPublished });
  rows.push({ section: 'Operations', metric: 'Applications received', value: report.operations.applicationsReceived });
  rows.push({
    section: 'Operations',
    metric: 'Average time to fill days',
    value: report.operations.averageTimeToFillDays ?? 'n/a',
  });

  const governanceValues: Array<[string, number | null]> = [
    ['Active role assignments', report.governance.activeRoleAssignments],
    ['Role assignments expiring in 30 days', report.governance.expiringRoleAssignments30Days],
    ['Active delegations', report.governance.activeDelegations],
    ['Delegations expiring in 30 days', report.governance.expiringDelegations30Days],
    ['Audit events', report.governance.auditEvents],
    ['Report exports', report.governance.reportExports],
  ];
  for (const [metric, value] of governanceValues) {
    if (value !== null) rows.push({ section: 'Governance', metric, value });
  }

  return rows;
}
