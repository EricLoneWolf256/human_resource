import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  ASSIGNMENT_TYPES,
  EMPLOYMENT_STATUS_TRANSITIONS,
  assignmentCreateSchema,
  statusChangeSchema,
  type EmployeeDetail,
  type OrgUnitDto,
  type Paginated,
} from '@umu-hr/shared';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, Detail, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, toneForStatus,
} from '../components/ui';
import { formatDate } from '../format';

export default function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [showAssignment, setShowAssignment] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [assignmentStart, setAssignmentStart] = useState(new Date().toISOString().slice(0, 10));

  const employee = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api<EmployeeDetail>(`/employees/${id}`),
  });
  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => api<Paginated<OrgUnitDto>>(`/org/units${qs({ pageSize: 100 })}`),
    enabled: hasPermission('employee.assign_unit'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['employee', id] });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const statusMutation = useMutation({
    mutationFn: (input: unknown) => api<{ ok: boolean }>(`/employees/${id}/status`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setActionError(caught.message),
  });
  const verifyMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/employees/${id}/verify`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
    onError: (caught: Error) => setActionError(caught.message),
  });
  const archiveMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/employees/${id}/archive`, { method: 'POST', body: JSON.stringify({ note: 'Archived from employee record' }) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setActionError(caught.message),
  });
  const assignmentMutation = useMutation({
    mutationFn: (input: unknown) => api(`/employees/${id}/assignments`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setShowAssignment(false); invalidate(); },
    onError: (caught: Error) => setActionError(caught.message),
  });

  if (employee.isLoading) return <Loading />;
  if (employee.isError) return <ErrorBlock message={employee.error.message} />;
  const data = employee.data;
  if (!data) return <EmptyState message="Employee not found" />;

  const allowed = EMPLOYMENT_STATUS_TRANSITIONS[data.employmentStatus];

  function submitStatus(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      statusMutation.mutate(statusChangeSchema.parse({ toStatus: status, effectiveDate, reason }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  function submitAssignment(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      assignmentMutation.mutate(assignmentCreateSchema.parse({ unitId, startDate: assignmentStart, assignmentType: ASSIGNMENT_TYPES[0] }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  return (
    <>
      <PageHeader
        title={data.fullName}
        subtitle={`${data.staffNumber} · ${data.employmentType.replace('_', ' ')}`}
        actions={<Badge tone={toneForStatus(data.employmentStatus)}>{data.employmentStatus.replace('_', ' ')}</Badge>}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Personal details">
          <dl>
            <Detail label="Preferred name" value={data.preferredName} />
            <Detail label="Email" value={data.contactEmail} />
            <Detail label="Phone" value={data.phone} />
            <Detail label="Gender" value={data.gender} />
            <Detail label="Date of birth" value={data.sensitiveVisible ? formatDate(data.dateOfBirth) : 'Restricted'} />
            <Detail label="National ID" value={data.sensitiveVisible ? data.nationalId : 'Restricted'} />
          </dl>
        </Card>
        <Card title="Employment">
          <dl>
            <Detail label="Profile status" value={data.profileStatus} />
            <Detail label="Hire date" value={formatDate(data.hireDate)} />
            <Detail label="End date" value={formatDate(data.endDate)} />
            <Detail label="Primary unit" value={data.primaryUnit?.name} />
            <Detail label="Position" value={data.positionTitle} />
            <Detail label="Completeness" value={`${data.completeness.percent}%`} />
          </dl>
          {data.completeness.missingFields.length > 0 ? (
            <p className="mt-3 text-xs text-amber-700">Missing: {data.completeness.missingFields.join(', ')}</p>
          ) : null}
        </Card>
        <Card title="Actions">
          <div className="space-y-3">
            {hasPermission('employee.verify') ? (
              <Button variant="secondary" onClick={() => verifyMutation.mutate()} disabled={data.profileStatus === 'VERIFIED'}>
                Verify record
              </Button>
            ) : null}
            {hasPermission('employee.archive') && allowed.includes('ARCHIVED') ? (
              <Button variant="danger" onClick={() => archiveMutation.mutate()}>Archive record</Button>
            ) : null}
            {hasPermission('employee.assign_unit') ? (
              <Button variant="secondary" onClick={() => setShowAssignment((value) => !value)}>Add assignment</Button>
            ) : null}
            {showAssignment ? (
              <form onSubmit={submitAssignment} className="space-y-2 rounded-lg bg-slate-50 p-3">
                <Field label="Unit">
                  <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                    <option value="">Select unit</option>
                    {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </Field>
                <Field label="Start date"><input className={inputClass} type="date" value={assignmentStart} onChange={(e) => setAssignmentStart(e.target.value)} required /></Field>
                <Button type="submit" disabled={assignmentMutation.isPending}>Save assignment</Button>
              </form>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Assignment history">
          {data.assignments.length === 0 ? <EmptyState message="No assignments recorded" /> : (
            <table className="table">
              <thead><tr><th>Unit</th><th>Position</th><th>Start</th><th>End</th><th>Type</th></tr></thead>
              <tbody>
                {data.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.unitName}</td>
                    <td>{assignment.positionTitle ?? '—'}</td>
                    <td>{formatDate(assignment.startDate)}</td>
                    <td>{formatDate(assignment.endDate)}</td>
                    <td>{assignment.assignmentType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Status history">
          {data.statusHistory.length === 0 ? <EmptyState message="No status changes recorded" /> : (
            <table className="table">
              <thead><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th></tr></thead>
              <tbody>
                {data.statusHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.effectiveDate)}</td>
                    <td>{entry.fromStatus ?? '—'}</td>
                    <td>{entry.toStatus}</td>
                    <td>{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {hasPermission('employee.update') && allowed.length > 0 ? (
        <Card title="Change employment status" className="mt-6">
          <form onSubmit={submitStatus} className="grid gap-4 sm:grid-cols-4">
            <Field label="New status">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} required>
                <option value="">Select</option>
                {allowed.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Effective date"><input className={inputClass} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required /></Field>
            <Field label="Reason"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
            <div className="flex items-end"><Button type="submit" disabled={statusMutation.isPending || !status}>Apply status</Button></div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
