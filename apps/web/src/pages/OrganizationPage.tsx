import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ORG_UNIT_TYPES,
  orgUnitCreateSchema,
  positionCreateSchema,
  type OrgTreeNode,
  type Paginated,
  type PositionDto,
} from '@umu-hr/shared';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';

function TreeBranch({ node }: { node: OrgTreeNode }) {
  return (
    <li className="ml-4 border-l border-slate-200 pl-4">
      <div className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <span className="font-medium text-slate-800">{node.name}</span>
        <span className="text-xs text-slate-400">{node.code}</span>
        <Badge tone={node.status === 'ACTIVE' ? 'green' : 'red'}>{node.type}</Badge>
        <span className="text-xs text-slate-500">{node.employeeCount} staff</span>
        {node.headName ? <span className="text-xs text-slate-500">Head: {node.headName}</span> : null}
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => <TreeBranch key={child.id} node={child} />)}
        </ul>
      ) : null}
    </li>
  );
}

export default function OrganizationPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [showUnit, setShowUnit] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState<string>(ORG_UNIT_TYPES[0]);
  const [parentId, setParentId] = useState('');
  const [positionCode, setPositionCode] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [positionUnitId, setPositionUnitId] = useState('');
  const [headcount, setHeadcount] = useState('1');
  const [error, setError] = useState('');

  const tree = useQuery({ queryKey: ['org-tree'], queryFn: () => api<OrgTreeNode[]>('/org/tree') });
  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => api<Paginated<{ id: string; name: string }>>(`/org/units${qs({ pageSize: 100 })}`),
  });
  const positions = useQuery({
    queryKey: ['positions', { page, search }],
    queryFn: () => api<Paginated<PositionDto>>(`/positions${qs({ page, pageSize: 20, q: search })}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['org-tree'] });
    void queryClient.invalidateQueries({ queryKey: ['org-units'] });
    void queryClient.invalidateQueries({ queryKey: ['positions'] });
  };

  const createUnit = useMutation({
    mutationFn: (input: unknown) => api('/org/units', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setShowUnit(false); invalidate(); },
    onError: (caught: Error) => setError(caught.message),
  });
  const createPosition = useMutation({
    mutationFn: (input: unknown) => api('/positions', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setShowPosition(false); invalidate(); },
    onError: (caught: Error) => setError(caught.message),
  });

  function submitUnit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      createUnit.mutate(orgUnitCreateSchema.parse({
        code: unitCode,
        name: unitName,
        type: unitType,
        parentId: parentId || null,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  function submitPosition(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      createPosition.mutate(positionCreateSchema.parse({
        code: positionCode,
        title: positionTitle,
        unitId: positionUnitId,
        approvedHeadcount: Number(headcount),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  return (
    <>
      <PageHeader
        title="Organization"
        subtitle="Units, reporting structure and approved positions"
        actions={
          hasPermission('org.manage') ? (
            <>
              <Button variant="secondary" onClick={() => setShowUnit((value) => !value)}>New unit</Button>
              <Button onClick={() => setShowPosition((value) => !value)}>New position</Button>
            </>
          ) : null
        }
      />
      {error ? <ErrorBlock message={error} /> : null}

      {showUnit ? (
        <Card title="Create organizational unit" className="mb-6">
          <form onSubmit={submitUnit} className="grid gap-4 sm:grid-cols-4">
            <Field label="Code"><input className={inputClass} value={unitCode} onChange={(e) => setUnitCode(e.target.value.toUpperCase())} required /></Field>
            <Field label="Name"><input className={inputClass} value={unitName} onChange={(e) => setUnitName(e.target.value)} required /></Field>
            <Field label="Type">
              <select className={inputClass} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
                {ORG_UNIT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Parent unit">
              <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">None</option>
                {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-4"><Button type="submit" disabled={createUnit.isPending}>Create unit</Button></div>
          </form>
        </Card>
      ) : null}

      {showPosition ? (
        <Card title="Create position" className="mb-6">
          <form onSubmit={submitPosition} className="grid gap-4 sm:grid-cols-5">
            <Field label="Code"><input className={inputClass} value={positionCode} onChange={(e) => setPositionCode(e.target.value.toUpperCase())} required /></Field>
            <Field label="Title"><input className={inputClass} value={positionTitle} onChange={(e) => setPositionTitle(e.target.value)} required /></Field>
            <Field label="Unit">
              <select className={inputClass} value={positionUnitId} onChange={(e) => setPositionUnitId(e.target.value)} required>
                <option value="">Select unit</option>
                {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </Field>
            <Field label="Approved headcount"><input className={inputClass} type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} required /></Field>
            <div className="flex items-end"><Button type="submit" disabled={createPosition.isPending}>Create position</Button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Unit hierarchy">
        {tree.isLoading ? <Loading /> : null}
        {tree.isError ? <ErrorBlock message={tree.error.message} /> : null}
        {tree.data?.length === 0 ? <EmptyState message="No units defined" /> : null}
        {tree.data && tree.data.length > 0 ? (
          <ul>
            {tree.data.map((node) => <TreeBranch key={node.id} node={node} />)}
          </ul>
        ) : null}
      </Card>

      <Card title="Positions" className="mt-6">
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(q); }}
        >
          <input className={inputClass} placeholder="Search positions" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="secondary" type="submit">Search</Button>
        </form>
        {positions.isLoading ? <Loading /> : null}
        {positions.isError ? <ErrorBlock message={positions.error.message} /> : null}
        {positions.data?.items.length === 0 ? <EmptyState message="No positions match your search" /> : null}
        {positions.data && positions.data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Code</th><th>Title</th><th>Unit</th><th>Grade</th><th>Headcount</th><th>Status</th></tr></thead>
                <tbody>
                  {positions.data.items.map((position) => (
                    <tr key={position.id}>
                      <td>{position.code}</td>
                      <td className="font-medium">{position.title}</td>
                      <td>{position.unitName}</td>
                      <td>{position.grade ?? '—'}</td>
                      <td>{position.filledCount}/{position.approvedHeadcount}</td>
                      <td><Badge tone={toneForStatus(position.status)}>{position.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={positions.data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
