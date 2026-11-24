import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ONBOARDING_TASK_STATUSES,
  type OnboardingChecklistDto,
  type OnboardingTemplateDto,
  type Paginated,
} from '@umu-hr/shared';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus } from '../components/ui';
import { formatDate } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

interface TaskUpdateInput {
  status: string;
  comment?: string;
}

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({});
  const [taskComments, setTaskComments] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');

  const templates = useQuery({
    queryKey: ['onboarding', 'templates'],
    queryFn: () => pageApi<Paginated<OnboardingTemplateDto> | OnboardingTemplateDto[]>('/onboarding/templates'),
  });
  const checklists = useQuery({
    queryKey: ['onboarding', 'checklists', page],
    queryFn: () => pageApi<Paginated<OnboardingChecklistDto> | OnboardingChecklistDto[]>(`/onboarding/checklists?page=${page}&pageSize=20`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createChecklist = useMutation({
    mutationFn: () =>
      pageApi<OnboardingChecklistDto>('/onboarding/checklists', {
        method: 'POST',
        body: JSON.stringify({ templateId, employeeId, dueDate: dueDate || null }),
      }),
    onSuccess: () => {
      setShowCreate(false);
      setTemplateId('');
      setEmployeeId('');
      setDueDate('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) =>
      pageApi(`/onboarding/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidate,
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    createChecklist.mutate();
  }

  function submitTask(event: FormEvent, taskId: string, currentStatus: string) {
    event.preventDefault();
    setActionError('');
    const input: TaskUpdateInput = {
      status: taskStatuses[taskId] ?? currentStatus,
      comment: taskComments[taskId] || undefined,
    };
    updateTask.mutate({ id: taskId, input });
  }

  const templateList = listItems(templates.data);
  const checklistList = listItems(checklists.data);

  return (
    <>
      <PageHeader
        title="Onboarding"
        subtitle="Templates, employee checklists and task progress"
        actions={<Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New checklist</Button>}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreate ? (
        <Card title="Create onboarding checklist" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-3">
            <Field label="Template">
              <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">Select template</option>
                {templateList.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </Field>
            <Field label="Employee ID"><input className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required /></Field>
            <Field label="Due date (optional)"><input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <div className="sm:col-span-3"><Button type="submit" disabled={createChecklist.isPending}>Create checklist</Button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Templates" className="mb-6">
        {templates.isLoading ? <Loading /> : null}
        {templates.isError ? <ErrorBlock message={pageErrorMessage(templates.error)} /> : null}
        {!templates.isLoading && !templates.isError && templateList.length === 0 ? <EmptyState message="No onboarding templates found" /> : null}
        {templateList.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templateList.map((template) => (
              <div key={template.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{template.name}</p>
                  <Badge tone={template.isActive ? 'green' : 'slate'}>{template.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{template.code}</p>
                <p className="mt-3 text-xs text-slate-500">{template.tasks.length} task{template.tasks.length === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Employee checklists">
        {checklists.isLoading ? <Loading /> : null}
        {checklists.isError ? <ErrorBlock message={pageErrorMessage(checklists.error)} /> : null}
        {!checklists.isLoading && !checklists.isError && checklistList.length === 0 ? <EmptyState message="No onboarding checklists found" /> : null}
        {checklistList.length > 0 ? (
          <>
            <div className="space-y-5">
              {checklistList.map((checklist) => (
                <div key={checklist.id} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-800">{checklist.employeeName}</p>
                      <p className="text-xs text-slate-500">{checklist.templateName} · Due {formatDate(checklist.dueDate)}</p>
                    </div>
                    <Badge tone={toneForStatus(checklist.status)}>{checklist.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th>Comment</th><th>Actions</th></tr></thead>
                      <tbody>
                        {checklist.tasks.map((task) => (
                          <tr key={task.id}>
                            <td className="font-medium">{task.title}</td>
                            <td>{task.ownerName ?? 'Unassigned'}</td>
                            <td>{formatDate(task.dueDate)}</td>
                            <td><Badge tone={toneForStatus(task.status)}>{task.status.replace('_', ' ')}</Badge></td>
                            <td>{task.comment ?? '—'}</td>
                            <td>
                              <form onSubmit={(event) => submitTask(event, task.id, task.status)} className="flex flex-wrap items-end gap-2">
                                <Field label="Status">
                                  <select
                                    className={inputClass}
                                    value={taskStatuses[task.id] ?? task.status}
                                    onChange={(e) => setTaskStatuses((current) => ({ ...current, [task.id]: e.target.value }))}
                                  >
                                    {ONBOARDING_TASK_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                                  </select>
                                </Field>
                                <Field label="Comment">
                                  <input
                                    className={inputClass}
                                    value={taskComments[task.id] ?? ''}
                                    onChange={(e) => setTaskComments((current) => ({ ...current, [task.id]: e.target.value }))}
                                  />
                                </Field>
                                <Button type="submit" disabled={updateTask.isPending}>Save</Button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={20} total={listTotal(checklists.data)} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
