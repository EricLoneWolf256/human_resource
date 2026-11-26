import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CAREER_CASE_TYPES,
  isCareerTransitionAllowed,
  type CareerCaseDto,
  type CareerCaseStatus,
  type CareerCaseType,
  type Paginated,
} from '@umu-hr/shared';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, Detail, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

const PROGRESS_STATUSES: CareerCaseStatus[] = [
  'ELIGIBILITY_CHECK',
  'DOCUMENT_VERIFICATION',
  'COMMITTEE_REVIEW',
  'RECOMMENDED',
  'REJECTED',
];

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  staffNumber: string;
}

interface UnitOption {
  id: string;
  name: string;
}

interface CreateCaseInput {
  employeeId: string;
  type: CareerCaseType;
  proposedUnitId: string | null;
  effectiveDate: string;
  reason: string;
}

interface ProgressInput {
  status: CareerCaseStatus;
  note?: string;
  documentsVerified?: boolean;
}

interface DecisionInput {
  decision: 'APPROVE' | 'REJECT';
  note: string;
  effectiveDate?: string;
}

function employeeLabel(employee: EmployeeOption): string {
  return `${employee.lastName}, ${employee.firstName} · ${employee.staffNumber}`;
}

export default function CareerPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [caseType, setCaseType] = useState<CareerCaseType>(CAREER_CASE_TYPES[0]);
  const [proposedUnitId, setProposedUnitId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [progressTargetId, setProgressTargetId] = useState('');
  const [progressStatus, setProgressStatus] = useState<CareerCaseStatus>('ELIGIBILITY_CHECK');
  const [progressNote, setProgressNote] = useState('');
  const [decisionTargetId, setDecisionTargetId] = useState('');
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionEffectiveDate, setDecisionEffectiveDate] = useState('');
  const [detailsId, setDetailsId] = useState('');
  const [actionError, setActionError] = useState('');

  const cases = useQuery({
    queryKey: ['career', 'cases', page],
    queryFn: () => pageApi<Paginated<CareerCaseDto> | CareerCaseDto[]>(`/career/cases?page=${page}&pageSize=20`),
  });
  const units = useQuery({
    queryKey: ['career', 'org-units'],
    queryFn: () => pageApi<Paginated<UnitOption> | UnitOption[]>('/org/units?pageSize=100'),
  });
  const employees = useQuery({
    queryKey: ['career', 'employees'],
    queryFn: () => pageApi<Paginated<EmployeeOption> | EmployeeOption[]>('/employees?pageSize=100'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['career'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createCase = useMutation({
    mutationFn: (input: CreateCaseInput) =>
      pageApi<CareerCaseDto>('/career/cases', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowCreate(false);
      setEmployeeId('');
      setCaseType(CAREER_CASE_TYPES[0]);
      setProposedUnitId('');
      setEffectiveDate('');
      setReason('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const progressCase = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProgressInput }) =>
      pageApi<CareerCaseDto>(`/career/cases/${id}/progress`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setProgressTargetId('');
      setProgressNote('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const decideCase = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DecisionInput }) =>
      pageApi<CareerCaseDto>(`/career/cases/${id}/decision`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setDecisionTargetId('');
      setDecisionNote('');
      setDecisionEffectiveDate('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const applyEffective = useMutation({
    mutationFn: (id: string) => pageApi<CareerCaseDto>(`/career/cases/${id}/effective`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const caseList = listItems(cases.data);
  const unitList = listItems(units.data);
  const employeeList = listItems(employees.data);
  const selectedCase = caseList.find((item) => item.id === detailsId);

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    if (reason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters');
      return;
    }
    createCase.mutate({
      employeeId,
      type: caseType,
      proposedUnitId: proposedUnitId || null,
      effectiveDate,
      reason: reason.trim(),
    });
  }

  function submitProgress(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    if (progressStatus === 'REJECTED' && progressNote.trim().length < 3) {
      setActionError('A note of at least 3 characters is required to reject a career case');
      return;
    }
    const input: ProgressInput = {
      status: progressStatus,
      note: progressNote.trim() || undefined,
    };
    if (progressStatus === 'DOCUMENT_VERIFICATION' || progressStatus === 'COMMITTEE_REVIEW') {
      input.documentsVerified = true;
    }
    progressCase.mutate({ id, input });
  }

  function submitDecision(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    if (decisionNote.trim().length < 3) {
      setActionError('A note of at least 3 characters is required');
      return;
    }
    decideCase.mutate({
      id,
      input: {
        decision,
        note: decisionNote.trim(),
        effectiveDate: decisionEffectiveDate || undefined,
      },
    });
  }

  function progressOptions(status: CareerCaseStatus): CareerCaseStatus[] {
    return PROGRESS_STATUSES.filter((target) => isCareerTransitionAllowed(status, target));
  }

  function unitName(id: string | null): string {
    if (!id) return '—';
    return unitList.find((unit) => unit.id === id)?.name ?? id;
  }

  function changePage(next: number) {
    setPage(next);
    setDetailsId('');
    setProgressTargetId('');
    setDecisionTargetId('');
  }

  return (
    <>
      <PageHeader
        title="Career"
        subtitle="Promotion, transfer and acting appointment cases"
        actions={
          hasPermission('career.submit') ? (
            <Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New case</Button>
          ) : null
        }
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreate && hasPermission('career.submit') ? (
        <Card title="Create career case" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-5">
            <Field label="Employee">
              <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                <option value="">Select employee</option>
                {employeeList.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select className={inputClass} value={caseType} onChange={(e) => setCaseType(e.target.value as CareerCaseType)}>
                {CAREER_CASE_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Proposed unit (optional)">
              <select className={inputClass} value={proposedUnitId} onChange={(e) => setProposedUnitId(e.target.value)}>
                <option value="">—</option>
                {unitList.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </Field>
            <Field label="Effective date">
              <input className={inputClass} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
            </Field>
            <Field label="Reason" hint="At least 10 characters">
              <textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
            </Field>
            {employees.isLoading || units.isLoading ? <div className="sm:col-span-5"><Loading /></div> : null}
            {employees.isError ? <div className="sm:col-span-5"><ErrorBlock message={pageErrorMessage(employees.error)} /></div> : null}
            {units.isError ? <div className="sm:col-span-5"><ErrorBlock message={pageErrorMessage(units.error)} /></div> : null}
            <div className="sm:col-span-5">
              <Button type="submit" disabled={createCase.isPending}>{createCase.isPending ? 'Submitting…' : 'Submit case'}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Career cases">
        {cases.isLoading ? <Loading /> : null}
        {cases.isError ? <ErrorBlock message={pageErrorMessage(cases.error)} /> : null}
        {!cases.isLoading && !cases.isError && caseList.length === 0 ? <EmptyState message="No career cases found" /> : null}
        {caseList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th><th>Employee</th><th>Type</th><th>Status</th><th>Effective date</th>
                    <th>Proposed unit</th><th>Decision note</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {caseList.map((item) => {
                    const options = progressOptions(item.status);
                    const canReview = hasPermission('promotion.review') && options.length > 0;
                    const canDecide = hasPermission('promotion.approve')
                      && (isCareerTransitionAllowed(item.status, 'APPROVED') || isCareerTransitionAllowed(item.status, 'REJECTED'));
                    const canApplyEffective = hasPermission('promotion.approve') && item.status === 'APPROVED';
                    return (
                      <tr key={item.id}>
                        <td className="font-medium">{item.reference}</td>
                        <td>{item.employeeName}</td>
                        <td>{item.type.replace('_', ' ')}</td>
                        <td><Badge tone={toneForStatus(item.status)}>{item.status.replace('_', ' ')}</Badge></td>
                        <td>{formatDate(item.effectiveDate)}</td>
                        <td>
                          {item.proposedUnitId ? (
                            <>
                              {unitName(item.proposedUnitId)}
                              <span className="block text-xs text-slate-400">{item.proposedUnitId}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="max-w-xs">{item.decisionNote ?? '—'}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button className="text-brand-600 hover:underline" onClick={() => setDetailsId(detailsId === item.id ? '' : item.id)}>
                              {detailsId === item.id ? 'Hide details' : 'Details'}
                            </button>
                            {canReview ? (
                              <button
                                className="text-brand-600 hover:underline"
                                onClick={() => {
                                  setProgressTargetId(item.id);
                                  setProgressStatus(options[0] ?? 'ELIGIBILITY_CHECK');
                                  setProgressNote('');
                                  setDecisionTargetId('');
                                }}
                              >
                                Review
                              </button>
                            ) : null}
                            {canDecide ? (
                              <button
                                className="text-brand-600 hover:underline"
                                onClick={() => {
                                  setDecisionTargetId(item.id);
                                  setDecision('APPROVE');
                                  setDecisionNote('');
                                  setDecisionEffectiveDate('');
                                  setProgressTargetId('');
                                }}
                              >
                                Decide
                              </button>
                            ) : null}
                            {canApplyEffective ? (
                              <button
                                className="text-emerald-600 hover:underline"
                                disabled={applyEffective.isPending}
                                onClick={() => { setActionError(''); applyEffective.mutate(item.id); }}
                              >
                                Make effective
                              </button>
                            ) : null}
                            {!canReview && !canDecide && !canApplyEffective ? <span className="text-slate-400">—</span> : null}
                          </div>
                          {progressTargetId === item.id && canReview ? (
                            <form onSubmit={(event) => submitProgress(event, item.id)} className="mt-2 space-y-2">
                              <Field label="Progress status">
                                <select
                                  className={inputClass}
                                  value={progressStatus}
                                  onChange={(e) => setProgressStatus(e.target.value as CareerCaseStatus)}
                                >
                                  {options.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                                </select>
                              </Field>
                              <Field label={progressStatus === 'REJECTED' ? 'Rejection note' : 'Note (optional)'}>
                                <input
                                  className={inputClass}
                                  value={progressNote}
                                  onChange={(e) => setProgressNote(e.target.value)}
                                  minLength={progressStatus === 'REJECTED' ? 3 : undefined}
                                  required={progressStatus === 'REJECTED'}
                                />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={progressCase.isPending}>Update</Button>
                                <Button type="button" variant="secondary" onClick={() => setProgressTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                          {decisionTargetId === item.id && canDecide ? (
                            <form onSubmit={(event) => submitDecision(event, item.id)} className="mt-2 space-y-2">
                              <Field label="Decision">
                                <select className={inputClass} value={decision} onChange={(e) => setDecision(e.target.value as 'APPROVE' | 'REJECT')}>
                                  <option value="APPROVE">Approve</option>
                                  <option value="REJECT">Reject</option>
                                </select>
                              </Field>
                              <Field label="Note">
                                <textarea className={inputClass} rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} minLength={3} required />
                              </Field>
                              <Field label="Effective date (optional)">
                                <input className={inputClass} type="date" value={decisionEffectiveDate} onChange={(e) => setDecisionEffectiveDate(e.target.value)} />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={decideCase.isPending}>Submit decision</Button>
                                <Button type="button" variant="secondary" onClick={() => setDecisionTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={listTotal(cases.data)} onPage={changePage} />
          </>
        ) : null}
      </Card>

      <Card title="Case events" className="mt-6">
        {!selectedCase ? <EmptyState message="Select a case to view its event history" /> : null}
        {selectedCase ? (
          <>
            <dl className="mb-5 grid gap-2 sm:grid-cols-2">
              <Detail label="Reference" value={selectedCase.reference} />
              <Detail label="Employee" value={selectedCase.employeeName} />
              <Detail label="Type" value={selectedCase.type.replace('_', ' ')} />
              <Detail label="Status" value={selectedCase.status.replace('_', ' ')} />
              <Detail label="Effective date" value={formatDate(selectedCase.effectiveDate)} />
              <Detail label="Decision note" value={selectedCase.decisionNote} />
            </dl>
            {selectedCase.events.length === 0 ? <EmptyState message="No events recorded" /> : null}
            {selectedCase.events.length > 0 ? (
              <ol className="space-y-3">
                {selectedCase.events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={toneForStatus(event.action)}>{event.action.replace('_', ' ')}</Badge>
                      <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{event.note ?? '—'}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.actorName ?? 'System'}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : null}
      </Card>
    </>
  );
}
