import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, ReportPayload } from '@umu-hr/shared';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorBlock, Field, inputClass, Loading, PageHeader } from '../components/ui';

interface Metric {
  label: string;
  count: number;
}

interface AppliedFilters {
  from: string;
  to: string;
  unitId: string;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): AppliedFilters {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - 365);
  return { from: dateOnly(from), to: dateOnly(to), unitId: '' };
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-400">{note}</p> : null}
    </Card>
  );
}

function Distribution({ title, rows }: { title: string; rows: Metric[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <Card title={title}>
      <div
        role="region"
        aria-label={`${title} table`}
        tabIndex={0}
        className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <table className="table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Count</th>
              <th scope="col">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-slate-500">{row.count}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function percent(completed: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${Math.round((completed / total) * 100)}%`;
}

export default function ReportsPage() {
  const { hasPermission } = useAuth();
  const [draft, setDraft] = useState<AppliedFilters>(defaultFilters);
  const [filters, setFilters] = useState<AppliedFilters>(defaultFilters);
  const canView = hasPermission('report.view');
  const canExport = hasPermission('report.export');

  const report = useQuery({
    queryKey: ['reports', filters],
    enabled: canView,
    queryFn: () => api<ReportPayload>(`/reports${qs({ ...filters })}`),
  });

  const units = useQuery({
    queryKey: ['org-units', 'report-filter'],
    enabled: hasPermission('org.view'),
    queryFn: () => api<Paginated<{ id: string; name: string }>>('/org/units?pageSize=100').then((page) => page.items),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setFilters(draft);
  }

  if (!canView) {
    return <ErrorBlock message="Your role does not include permission to view reports." />;
  }
  if (report.isLoading) return <Loading label="Building report…" />;
  if (report.isError) return <ErrorBlock message={report.error.message} />;
  const data = report.data;
  if (!data) return <Loading label="Building report…" />;

  const query = qs({ ...filters });
  const objectRows = (values: Record<string, number>): Metric[] =>
    Object.entries(values).map(([label, count]) => ({ label, count }));

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle={`${data.period.scopeLabel} scope · ${data.period.from} to ${data.period.to}${
          data.period.unitName ? ` · ${data.period.unitName}` : ''
        }`}
        actions={
          canExport ? (
            <Button variant="secondary" onClick={() => { window.location.href = `/api/reports/export${query}`; }}>
              Export CSV
            </Button>
          ) : null
        }
      />

      <form onSubmit={submit} className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Field label="From">
          <input className={inputClass} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} required />
        </Field>
        <Field label="To">
          <input className={inputClass} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} required />
        </Field>
        <Field label="Organizational unit" hint="Optional UUID; leave blank for your whole scope.">
          <input
            className={inputClass}
            list="report-unit-options"
            value={draft.unitId}
            onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}
            placeholder="All units in scope"
          />
          <datalist id="report-unit-options">
            {(units.data ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </datalist>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={report.isFetching}>Apply filters</Button>
        </div>
      </form>

      <p className="mb-5 text-xs text-slate-500">
        Generated {new Date(data.period.generatedAt).toLocaleString()} · Aggregate values only · Exports are audited.
      </p>

      <div className="grid-cards mb-6">
        <Stat label="Employees in scope" value={data.workforce.total} />
        <Stat label="Hires in period" value={data.workforce.hires} />
        <Stat label="Exits in period" value={data.workforce.exits} />
        <Stat label="Academic / non-academic" value={`${data.workforce.academic.academic} / ${data.workforce.academic.nonAcademic}`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Distribution title="Headcount by status" rows={objectRows(data.workforce.byStatus)} />
        <Distribution title="Headcount by employment type" rows={objectRows(data.workforce.byEmploymentType)} />
        <Distribution title="Headcount by unit" rows={data.workforce.byUnit} />
        <Distribution title="Headcount by grade" rows={data.workforce.byGrade} />
      </div>

      <div className="grid-cards mb-6">
        <Stat label="Pending leave" value={data.operations.pendingLeave} />
        <Stat label="Contracts expiring in 30 days" value={data.operations.contractsExpiring30Days} />
        <Stat label="Open HR requests" value={data.operations.openRequests} />
        <Stat label="Overdue appraisals" value={data.operations.overdueAppraisals} />
        <Stat label="Certificates expiring in 90 days" value={data.operations.certificatesExpiring90Days} />
        <Stat label="Applications received" value={data.operations.applicationsReceived} />
        <Stat label="Onboarding completion" value={percent(data.operations.onboardingCompletion.completed, data.operations.onboardingCompletion.total)} />
        <Stat label="Appraisal completion" value={percent(data.operations.appraisalCompletion.completed, data.operations.appraisalCompletion.total)} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Distribution title="Leave by status" rows={objectRows(data.operations.leaveByStatus)} />
        <Distribution title="Leave by type" rows={data.operations.leaveByType} />
        <Distribution title="Requests by category" rows={data.operations.requestsByCategory} />
        <Distribution title="Requests by status" rows={objectRows(data.operations.requestsByStatus)} />
        <Distribution title="Applications by status" rows={objectRows(data.operations.applicationsByStatus)} />
        <Distribution title="Contracts by renewal status" rows={objectRows(data.operations.contractsByRenewalStatus)} />
      </div>

      {Object.values(data.governance).some((value) => value !== null) ? (
        <Card title="Governance">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.governance).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-100 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{value === null ? 'Not authorized' : value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
    </>
  );
}
