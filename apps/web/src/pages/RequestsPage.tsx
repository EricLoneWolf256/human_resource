import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HR_REQUEST_CATEGORIES,
  HR_REQUEST_STATUSES,
  SENSITIVITY_LEVELS,
  hrRequestAssignSchema,
  hrRequestCreateSchema,
  hrRequestStatusSchema,
  type HrRequestDto,
  type Paginated,
} from '@umu-hr/shared';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus } from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

function sensitivityTone(value: string): 'slate' | 'green' | 'amber' | 'red' | 'blue' {
  if (value === 'HIGHLY_RESTRICTED') return 'red';
  if (value === 'CONFIDENTIAL') return 'amber';
  return 'slate';
}

export default function RequestsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [category, setCategory] = useState<string>(HR_REQUEST_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [sensitivity, setSensitivity] = useState<string>(SENSITIVITY_LEVELS[0]);
  const [assignRequestId, setAssignRequestId] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [statusRequestId, setStatusRequestId] = useState('');
  const [status, setStatus] = useState<string>(HR_REQUEST_STATUSES[0]);
  const [statusComment, setStatusComment] = useState('');
  const [actionError, setActionError] = useState('');

  const requests = useQuery({
    queryKey: ['requests', page],
    queryFn: () => pageApi<Paginated<HrRequestDto> | HrRequestDto[]>(`/requests?page=${page}&pageSize=20`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createRequest = useMutation({
    mutationFn: (input: unknown) => pageApi<HrRequestDto>('/requests', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowCreate(false);
      setSubject('');
      setDescription('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const assignRequest = useMutation({
    mutationFn: ({ id, input }: { id: string; input: unknown }) =>
      pageApi(`/requests/${id}/assign`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowAssign(false);
      setAssignRequestId('');
      setAssignUserId('');
      setAssignNote('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, input }: { id: string; input: unknown }) =>
      pageApi(`/requests/${id}/status`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowStatus(false);
      setStatusRequestId('');
      setStatusComment('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      createRequest.mutate(hrRequestCreateSchema.parse({ category, subject, description, sensitivity }));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid request details');
    }
  }

  function submitAssign(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      const input = hrRequestAssignSchema.parse({ assignedToUserId: assignUserId, note: assignNote || undefined });
      assignRequest.mutate({ id: assignRequestId, input });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid assignment details');
    }
  }

  function submitStatus(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      const input = hrRequestStatusSchema.parse({ status, comment: statusComment || undefined });
      changeStatus.mutate({ id: statusRequestId, input });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid status details');
    }
  }

  const hrRequests = listItems(requests.data);

  return (
    <>
      <PageHeader
        title="HR requests"
        subtitle="Service requests, assignments and status changes"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New request</Button>
            <Button variant="secondary" onClick={() => setShowAssign((value) => !value)}>Assign</Button>
            <Button onClick={() => setShowStatus((value) => !value)}>Change status</Button>
          </>
        }
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreate ? (
        <Card title="Create HR request" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {HR_REQUEST_CATEGORIES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Sensitivity">
              <select className={inputClass} value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                {SENSITIVITY_LEVELS.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Subject">
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={150} required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} required />
              </Field>
            </div>
            <div className="sm:col-span-2"><Button type="submit" disabled={createRequest.isPending}>Submit request</Button></div>
          </form>
        </Card>
      ) : null}

      {showAssign ? (
        <Card title="Assign request" className="mb-6">
          <form onSubmit={submitAssign} className="grid gap-4 sm:grid-cols-3">
            <Field label="Request">
              <select className={inputClass} value={assignRequestId} onChange={(e) => setAssignRequestId(e.target.value)} required>
                <option value="">Select request</option>
                {hrRequests.map((item) => <option key={item.id} value={item.id}>{item.reference} — {item.subject}</option>)}
              </select>
            </Field>
            <Field label="User ID"><input className={inputClass} value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} required /></Field>
            <Field label="Note (optional)"><input className={inputClass} value={assignNote} onChange={(e) => setAssignNote(e.target.value)} /></Field>
            <div className="sm:col-span-3"><Button type="submit" disabled={assignRequest.isPending || !assignRequestId}>Assign request</Button></div>
          </form>
        </Card>
      ) : null}

      {showStatus ? (
        <Card title="Change request status" className="mb-6">
          <form onSubmit={submitStatus} className="grid gap-4 sm:grid-cols-3">
            <Field label="Request">
              <select className={inputClass} value={statusRequestId} onChange={(e) => setStatusRequestId(e.target.value)} required>
                <option value="">Select request</option>
                {hrRequests.map((item) => <option key={item.id} value={item.id}>{item.reference} — {item.subject}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                {HR_REQUEST_STATUSES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Comment"><input className={inputClass} value={statusComment} onChange={(e) => setStatusComment(e.target.value)} /></Field>
            <div className="sm:col-span-3"><Button type="submit" disabled={changeStatus.isPending || !statusRequestId}>Update status</Button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Request register">
        {requests.isLoading ? <Loading /> : null}
        {requests.isError ? <ErrorBlock message={pageErrorMessage(requests.error)} /> : null}
        {!requests.isLoading && !requests.isError && hrRequests.length === 0 ? <EmptyState message="No HR requests found" /> : null}
        {hrRequests.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Reference</th><th>Category</th><th>Subject</th><th>Status</th><th>Sensitivity</th><th>Assignee</th><th>Due</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {hrRequests.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium">{item.reference}</td>
                      <td>{item.category.replace('_', ' ')}</td>
                      <td>
                        {item.subject}
                        <span className="block text-xs text-slate-400">{item.requesterName}</span>
                      </td>
                      <td><Badge tone={toneForStatus(item.status)}>{item.status.replace('_', ' ')}</Badge></td>
                      <td><Badge tone={sensitivityTone(item.sensitivity)}>{item.sensitivity.replace('_', ' ')}</Badge></td>
                      <td>{item.assignedToName ?? 'Unassigned'}</td>
                      <td>{formatDate(item.dueAt)}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
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
