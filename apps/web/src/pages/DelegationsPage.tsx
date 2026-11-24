import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SCOPE_TYPES,
  delegationCreateSchema,
  delegationRevokeSchema,
  type DelegationDto,
  type Paginated,
} from '@umu-hr/shared';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus } from '../components/ui';
import { formatDate } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

export default function DelegationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [permissionKey, setPermissionKey] = useState('');
  const [scopeType, setScopeType] = useState<string>(SCOPE_TYPES[0]);
  const [scopeUnitId, setScopeUnitId] = useState('');
  const [reason, setReason] = useState('');
  const [revokeTargetId, setRevokeTargetId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [actionError, setActionError] = useState('');

  const delegations = useQuery({
    queryKey: ['delegations', page],
    queryFn: () => pageApi<Paginated<DelegationDto> | DelegationDto[]>(`/delegations?page=${page}&pageSize=20`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['delegations'] });
    void queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const createDelegation = useMutation({
    mutationFn: (input: unknown) => pageApi<DelegationDto>('/delegations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowCreate(false);
      setDelegateUserId('');
      setPermissionKey('');
      setScopeType(SCOPE_TYPES[0]);
      setScopeUnitId('');
      setReason('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const revokeDelegation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: unknown }) =>
      pageApi(`/delegations/${id}/revoke`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setRevokeTargetId('');
      setRevokeReason('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    try {
      const input = delegationCreateSchema.parse({
        delegateUserId,
        permissionKey,
        scopeType,
        scopeUnitId: scopeUnitId || null,
        reason,
      });
      createDelegation.mutate(input);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid delegation details');
    }
  }

  function submitRevoke(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    try {
      revokeDelegation.mutate({ id, input: delegationRevokeSchema.parse({ reason: revokeReason }) });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid revocation reason');
    }
  }

  const delegationList = listItems(delegations.data);

  return (
    <>
      <PageHeader
        title="Delegations"
        subtitle="Temporary access granted by HR administrators"
        actions={<Button variant="secondary" onClick={() => setShowCreate((value) => !value)}>New delegation</Button>}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreate ? (
        <Card title="Create delegation" className="mb-6">
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-3">
            <Field label="Delegate user ID"><input className={inputClass} value={delegateUserId} onChange={(e) => setDelegateUserId(e.target.value)} required /></Field>
            <Field label="Permission key"><input className={inputClass} value={permissionKey} onChange={(e) => setPermissionKey(e.target.value)} minLength={3} required /></Field>
            <Field label="Scope type">
              <select className={inputClass} value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
                {SCOPE_TYPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
            </Field>
            <Field label="Scope unit ID" hint="Required for DEPARTMENT and FACULTY scopes.">
              <input className={inputClass} value={scopeUnitId} onChange={(e) => setScopeUnitId(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required /></Field>
            </div>
            <div className="sm:col-span-3"><Button type="submit" disabled={createDelegation.isPending}>Create delegation</Button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Delegation register">
        {delegations.isLoading ? <Loading /> : null}
        {delegations.isError ? <ErrorBlock message={pageErrorMessage(delegations.error)} /> : null}
        {!delegations.isLoading && !delegations.isError && delegationList.length === 0 ? <EmptyState message="No delegations found" /> : null}
        {delegationList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Grantor</th><th>Delegate</th><th>Permission</th><th>Scope</th><th>Period</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {delegationList.map((delegation) => (
                    <tr key={delegation.id}>
                      <td>{delegation.grantorName}</td>
                      <td className="font-medium">{delegation.delegateName}</td>
                      <td>{delegation.permissionKey}</td>
                      <td>{delegation.scopeType}{delegation.scopeUnitName ? ` · ${delegation.scopeUnitName}` : ''}</td>
                      <td>{formatDate(delegation.startDate)} – {formatDate(delegation.endDate)}</td>
                      <td className="max-w-xs">{delegation.reason}</td>
                      <td><Badge tone={toneForStatus(delegation.status)}>{delegation.status}</Badge></td>
                      <td>
                        {delegation.status === 'ACTIVE' ? (
                          <button className="text-rose-600 hover:underline" onClick={() => { setRevokeTargetId(delegation.id); setRevokeReason(''); }}>
                            Revoke
                          </button>
                        ) : <span className="text-slate-400">—</span>}
                        {revokeTargetId === delegation.id ? (
                          <form onSubmit={(event) => submitRevoke(event, delegation.id)} className="mt-2 space-y-2">
                            <Field label="Revocation reason">
                              <input
                                className={inputClass}
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                                minLength={3}
                                required
                              />
                            </Field>
                            <div className="flex gap-2">
                              <Button type="submit" variant="danger" disabled={revokeDelegation.isPending}>Confirm</Button>
                              <Button type="button" variant="secondary" onClick={() => setRevokeTargetId('')}>Close</Button>
                            </div>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={listTotal(delegations.data)} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
