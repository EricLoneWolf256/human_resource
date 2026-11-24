import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveDecisionSchema, type LeaveBalanceDto, type LeaveRequestDto, type LeaveTypeDto, type Paginated } from '@umu-hr/shared';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

interface CreateLeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export default function LeavePage() {
  const { session, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [decisionTargetId, setDecisionTargetId] = useState('');
  const [decisionAction, setDecisionAction] = useState('APPROVE');
  const [decisionComment, setDecisionComment] = useState('');
  const [actionError, setActionError] = useState('');

  const requests = useQuery({
    queryKey: ['leave', 'requests', page],
    queryFn: () => pageApi<Paginated<LeaveRequestDto> | LeaveRequestDto[]>(`/leave/requests?page=${page}&pageSize=20`),
  });
  const types = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => pageApi<Paginated<LeaveTypeDto> | LeaveTypeDto[]>('/leave/types'),
  });
  const balances = useQuery({
    queryKey: ['leave', 'balances'],
    queryFn: () => pageApi<Paginated<LeaveBalanceDto> | LeaveBalanceDto[]>('/leave/balances'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['leave'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createLeave = useMutation({
    mutationFn: (input: CreateLeaveInput) =>
      pageApi<LeaveRequestDto>('/leave/requests', { method: 'POST', body: JSON.stringify({ ...input, reason: input.reason || null }) }),
    onSuccess: () => {
      setShowCreate(false);
      setLeaveTypeId('');
      setStartDate('');
      setEndDate('');
      setReason('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const cancelLeave = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      pageApi(`/leave/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: note }) }),
    onSuccess: () => {
      setCancelTargetId('');
      setCancelReason('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const decideLeave = useMutation({
    mutationFn: ({ id, input }: { id: string; input: unknown }) =>
      pageApi(`/leave/requests/${id}/decision`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setDecisionTargetId('');
      setDecisionComment('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    createLeave.mutate({ leaveTypeId, startDate, endDate, reason });
  }

  function submitCancel(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    cancelLeave.mutate({ id, note: cancelReason });
  }

  function canCancel(request: LeaveRequestDto): boolean {
    return session?.employeeId === request.employeeId
      && ['SUBMITTED', 'PENDING_HR', 'APPROVED'].includes(request.status);
  }

  function canDecide(request: LeaveRequestDto): boolean {
    return session?.employeeId !== request.employeeId
      && ['SUBMITTED', 'PENDING_HR'].includes(request.status)
      && (hasPermission('leave.approve') || hasPermission('leave.reject'));
  }

  function submitDecision(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    try {
      decideLeave.mutate({ id, input: leaveDecisionSchema.parse({ action: decisionAction, comment: decisionComment || undefined }) });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid decision details');
    }
  }

  const leaveRequests = listItems(requests.data);
  const leaveTypes = listItems(types.data);
  const leaveBalances = listItems(balances.data);

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle="Leave requests, approvals and current balances"
        actions={<Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New leave request</Button>}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreate ? (
        <Card title="Create leave request" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-4">
            <Field label="Leave type">
              <select className={inputClass} value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
                <option value="">Select type</option>
                {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </Field>
            <Field label="Start date"><input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></Field>
            <Field label="End date"><input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></Field>
            <Field label="Reason"><textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
            <div className="sm:col-span-4">
              <Button type="submit" disabled={createLeave.isPending}>{createLeave.isPending ? 'Submitting…' : 'Submit request'}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Balance summary" className="mb-6">
        {balances.isLoading ? <Loading /> : null}
        {balances.isError ? <ErrorBlock message={pageErrorMessage(balances.error)} /> : null}
        {!balances.isLoading && !balances.isError && leaveBalances.length === 0 ? <EmptyState message="No leave balances available" /> : null}
        {leaveBalances.length > 0 ? (
          <div className="grid-cards">
            {leaveBalances.map((balance) => (
              <div key={balance.id} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-800">{balance.leaveTypeName}</p>
                <p className="mt-1 text-xs text-slate-500">Period {balance.period}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{balance.availableDays} days</p>
                <p className="mt-1 text-xs text-slate-500">Entitlement {balance.entitlementDays} · Used {balance.usedDays}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Leave requests">
        {requests.isLoading ? <Loading /> : null}
        {requests.isError ? <ErrorBlock message={pageErrorMessage(requests.error)} /> : null}
        {!requests.isLoading && !requests.isError && leaveRequests.length === 0 ? <EmptyState message="No leave requests found" /> : null}
        {leaveRequests.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Submitted</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {leaveRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="font-medium">{request.employeeName}<span className="block text-xs text-slate-400">{request.staffNumber}</span></td>
                      <td>{request.leaveTypeName}</td>
                      <td>{formatDate(request.startDate)} – {formatDate(request.endDate)}</td>
                      <td>{request.daysRequested}</td>
                      <td><Badge tone={toneForStatus(request.status)}>{request.status.replace('_', ' ')}</Badge></td>
                      <td>{formatDateTime(request.submittedAt)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {canCancel(request) ? (
                            <button className="text-rose-600 hover:underline" onClick={() => { setCancelTargetId(request.id); setCancelReason(''); setDecisionTargetId(''); }}>
                              Cancel request
                            </button>
                          ) : null}
                          {canDecide(request) ? (
                            <button className="text-brand-600 hover:underline" onClick={() => { setDecisionTargetId(request.id); setDecisionAction('APPROVE'); setDecisionComment(''); setCancelTargetId(''); }}>
                              Decide
                            </button>
                          ) : null}
                          {!canCancel(request) && !canDecide(request) ? <span className="text-slate-400">—</span> : null}
                        </div>
                        {cancelTargetId === request.id ? (
                          <form onSubmit={(event) => submitCancel(event, request.id)} className="mt-2 space-y-2">
                            <Field label="Cancellation reason">
                              <input
                                className={inputClass}
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                minLength={3}
                                required
                              />
                            </Field>
                            <div className="flex gap-2">
                              <Button type="submit" variant="danger" disabled={cancelLeave.isPending}>Confirm</Button>
                              <Button type="button" variant="secondary" onClick={() => setCancelTargetId('')}>Close</Button>
                            </div>
                          </form>
                        ) : null}
                        {decisionTargetId === request.id ? (
                          <form onSubmit={(event) => submitDecision(event, request.id)} className="mt-2 space-y-2">
                            <Field label="Decision">
                              <select className={inputClass} value={decisionAction} onChange={(e) => setDecisionAction(e.target.value)}>
                                {hasPermission('leave.approve') ? <option value="APPROVE">Approve</option> : null}
                                {hasPermission('leave.reject') ? <option value="REJECT">Reject</option> : null}
                                {hasPermission('leave.approve') ? <option value="SEND_HR">Send to HR</option> : null}
                              </select>
                            </Field>
                            <Field label="Comment">
                              <textarea className={inputClass} rows={2} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
                            </Field>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={decideLeave.isPending}>Submit decision</Button>
                              <Button type="button" variant="secondary" onClick={() => setDecisionTargetId('')}>Close</Button>
                            </div>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={listTotal(requests.data)} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
