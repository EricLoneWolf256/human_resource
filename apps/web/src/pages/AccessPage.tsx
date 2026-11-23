import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SCOPE_TYPES,
  USER_STATUSES,
  assignRoleSchema,
  createUserSchema,
  updateUserStatusSchema,
  type OrgUnitDto,
  type Paginated,
  type RoleDto,
  type UserDto,
} from '@umu-hr/shared';
import { api, qs } from '../api';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDateTime } from '../format';

export default function AccessPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scopeType, setScopeType] = useState<string>(SCOPE_TYPES[0]);
  const [scopeUnitId, setScopeUnitId] = useState('');
  const [reason, setReason] = useState('');

  const users = useQuery({
    queryKey: ['users', page],
    queryFn: () => api<Paginated<UserDto>>(`/access/users${qs({ page, pageSize: 20 })}`),
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleDto[]>('/access/roles') });
  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => api<Paginated<OrgUnitDto>>(`/org/units${qs({ pageSize: 100 })}`),
  });
  const employees = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api<Paginated<{ id: string; staffNumber: string; fullName: string }>>(`/employees${qs({ pageSize: 100 })}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const createUser = useMutation({
    mutationFn: (input: unknown) => api<UserDto>('/access/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setShowCreate(false); setMessage('Account created.'); invalidate(); },
    onError: (caught: Error) => setError(caught.message),
  });
  const assignRole = useMutation({
    mutationFn: (input: unknown) => api(`/access/users/${userId}/roles`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setShowAssign(false); setMessage('Role assigned.'); invalidate(); },
    onError: (caught: Error) => setError(caught.message),
  });
  const revokeRole = useMutation({
    mutationFn: ({ assignmentId, note }: { assignmentId: string; note: string }) =>
      api(`/access/roles/${assignmentId}/revoke`, { method: 'POST', body: JSON.stringify({ reason: note }) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setError(caught.message),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api(`/access/users/${id}/status`, { method: 'PATCH', body: JSON.stringify(updateUserStatusSchema.parse({ status, reason: note })) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setError(caught.message),
  });
  const resetPassword = useMutation({
    mutationFn: (id: string) => api<{ temporaryPassword?: string }>(`/access/users/${id}/reset-password`, { method: 'POST', body: '{}' }),
    onSuccess: (result) => setMessage(result.temporaryPassword ? `Temporary password: ${result.temporaryPassword}` : 'Password reset.'),
    onError: (caught: Error) => setError(caught.message),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      createUser.mutate(createUserSchema.parse({ email, password, employeeId: employeeId || null }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  function submitRole(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      assignRole.mutate(assignRoleSchema.parse({
        roleId,
        scopeType,
        scopeUnitId: scopeUnitId || null,
        reason,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  return (
    <>
      <PageHeader
        title="Access control"
        subtitle="Accounts, roles and effective scopes"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New account</Button>
            <Button onClick={() => setShowAssign((value) => !value)}>Assign role</Button>
          </>
        }
      />
      {error ? <ErrorBlock message={error} /> : null}
      {message ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      {showCreate ? (
        <Card title="Create account" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-3">
            <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Initial password" hint="At least 10 characters with a letter and digit.">
              <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Field label="Employee (optional)">
              <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">None</option>
                {employees.data?.items.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.staffNumber} — {employee.fullName}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-3"><Button type="submit" disabled={createUser.isPending}>Create account</Button></div>
          </form>
        </Card>
      ) : null}

      {showAssign ? (
        <Card title="Assign role and scope" className="mb-6">
          <form onSubmit={submitRole} className="grid gap-4 sm:grid-cols-3">
            <Field label="User">
              <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">Select user</option>
                {users.data?.items.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select className={inputClass} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                <option value="">Select role</option>
                {roles.data?.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </Field>
            <Field label="Scope type">
              <select className={inputClass} value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
                {SCOPE_TYPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
            </Field>
            <Field label="Scope unit (required for department/faculty)">
              <select className={inputClass} value={scopeUnitId} onChange={(e) => setScopeUnitId(e.target.value)}>
                <option value="">None</option>
                {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </Field>
            <Field label="Reason"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
            <div className="flex items-end"><Button type="submit" disabled={assignRole.isPending}>Assign role</Button></div>
          </form>
        </Card>
      ) : null}

      <Card title="User accounts">
        {users.isLoading ? <Loading /> : null}
        {users.isError ? <ErrorBlock message={users.error.message} /> : null}
        {users.data?.items.length === 0 ? <EmptyState message="No accounts found" /> : null}
        {users.data && users.data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Email</th><th>Employee</th><th>Status</th><th>Roles</th><th>Last login</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id}>
                      <td className="font-medium">{user.email}</td>
                      <td>{user.employeeName ?? '—'}</td>
                      <td><Badge tone={toneForStatus(user.status)}>{user.status}</Badge></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? '—' : user.roles.map((role) => (
                            <span key={role.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                              {role.roleKey} · {role.scopeType}
                              {role.effective ? null : ' (inactive)'}
                              <button
                                className="text-rose-600 hover:underline"
                                onClick={() => {
                                  const note = window.prompt('Reason for revoking this role', '');
                                  if (note) revokeRole.mutate({ assignmentId: role.id, note });
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDateTime(user.lastLoginAt)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <button className="text-brand-600 hover:underline" onClick={() => { setUserId(user.id); setShowAssign(true); }}>Add role</button>
                          <button className="text-brand-600 hover:underline" onClick={() => resetPassword.mutate(user.id)}>Reset password</button>
                          <select
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                            value=""
                            onChange={(event) => {
                              const status = event.target.value;
                              const note = window.prompt(`Reason for setting status to ${status}`, '');
                              if (note) changeStatus.mutate({ id: user.id, status, note });
                            }}
                          >
                            <option value="">Set status…</option>
                            {USER_STATUSES.filter((item) => item !== user.status).map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={users.data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>

      <Card title="Role catalogue" className="mt-6">
        {roles.isLoading ? <Loading /> : null}
        {roles.data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roles.data.map((role) => (
              <div key={role.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-800">{role.name}</p>
                <p className="text-xs text-slate-500">{role.key}</p>
                <p className="mt-2 text-xs text-slate-500">{role.permissions.length} permissions</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  );
}
