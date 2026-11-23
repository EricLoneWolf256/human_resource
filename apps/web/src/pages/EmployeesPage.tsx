import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  employeeCreateSchema,
  type EmployeeListItem,
  type OrgUnitDto,
  type Paginated,
} from '@umu-hr/shared';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, TextLink, toneForStatus,
} from '../components/ui';
import { formatDate } from '../format';

interface CreateForm {
  staffNumber: string;
  firstName: string;
  lastName: string;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  hireDate: string;
  unitId: string;
}

function CreateEmployeeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors } } = useForm<CreateForm>({
    defaultValues: { staffNumber: '', firstName: '', lastName: '', employmentType: 'PERMANENT', hireDate: '', unitId: '' },
  });
  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => api<Paginated<OrgUnitDto>>(`/org/units${qs({ pageSize: 100 })}`),
  });

  const mutation = useMutation({
    mutationFn: (input: unknown) => api<EmployeeListItem>('/employees', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const submit = handleSubmit(async (values) => {
    setError('');
    try {
      const input = employeeCreateSchema.parse({
        staffNumber: values.staffNumber,
        firstName: values.firstName,
        lastName: values.lastName,
        employmentType: values.employmentType,
        hireDate: values.hireDate || undefined,
        ...(values.unitId
          ? { assignment: { unitId: values.unitId, startDate: values.hireDate || new Date().toISOString().slice(0, 10) } }
          : {}),
      });
      mutation.mutate(input);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New employee record</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>Close</button>
        </div>
        {error ? <ErrorBlock message={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Staff number" hint="UMU-0001">
            <input {...register('staffNumber')} className={inputClass} placeholder="UMU-0001" />
            {errors.staffNumber ? <span className="text-xs text-rose-600">{errors.staffNumber.message}</span> : null}
          </Field>
          <Field label="Employment type">
            <select {...register('employmentType')} className={inputClass}>
              {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="First name"><input {...register('firstName')} className={inputClass} /></Field>
          <Field label="Last name"><input {...register('lastName')} className={inputClass} /></Field>
          <Field label="Hire date"><input {...register('hireDate')} className={inputClass} type="date" /></Field>
          <Field label="Primary unit (optional)">
            <select {...register('unitId')} className={inputClass}>
              <option value="">—</option>
              {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Create record'}</Button>
      </form>
    </div>
  );
}

export default function EmployeesPage() {
  const { hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [unitId, setUnitId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => api<Paginated<OrgUnitDto>>(`/org/units${qs({ pageSize: 100 })}`),
    enabled: hasPermission('org.view'),
  });

  const employees = useQuery({
    queryKey: ['employees', { page, search, status, unitId }],
    queryFn: () => api<Paginated<EmployeeListItem>>(`/employees${qs({ page, pageSize: 20, q: search, employmentStatus: status, unitId })}`),
  });

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(q);
  }

  return (
    <>
      <PageHeader
        title="Employee directory"
        subtitle="Records visible within your assigned scope"
        actions={
          <>
            {hasPermission('employee.export') ? (
              <Button variant="secondary" onClick={() => { window.location.href = `/api/employees/export${qs({ q: search, employmentStatus: status, unitId })}`; }}>
                Export CSV
              </Button>
            ) : null}
            {hasPermission('employee.create') ? <Button onClick={() => setShowCreate(true)}>New employee</Button> : null}
          </>
        }
      />
      <Card>
        <form onSubmit={onSearch} className="mb-5 grid gap-3 sm:grid-cols-4">
          <input className={inputClass} placeholder="Search name or staff number" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {EMPLOYMENT_STATUSES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
          </select>
          <select className={inputClass} value={unitId} onChange={(e) => { setUnitId(e.target.value); setPage(1); }}>
            <option value="">All units</option>
            {units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          <Button type="submit" variant="secondary">Apply filters</Button>
        </form>

        {employees.isLoading ? <Loading /> : null}
        {employees.isError ? <ErrorBlock message={employees.error.message} /> : null}
        {employees.data?.items.length === 0 ? <EmptyState message="No employees match your filters" /> : null}
        {employees.data && employees.data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Staff number</th><th>Name</th><th>Unit</th><th>Position</th><th>Status</th><th>Hire date</th></tr>
                </thead>
                <tbody>
                  {employees.data.items.map((item) => (
                    <tr key={item.id}>
                      <td><TextLink to={`/employees/${item.id}`}>{item.staffNumber}</TextLink></td>
                      <td className="font-medium text-slate-900">{item.fullName}</td>
                      <td>{item.primaryUnit?.name ?? '—'}</td>
                      <td>{item.positionTitle ?? '—'}</td>
                      <td><Badge tone={toneForStatus(item.employmentStatus)}>{item.employmentStatus.replace('_', ' ')}</Badge></td>
                      <td>{formatDate(item.hireDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={employees.data.total} onPage={(next) => { setPage(next); void queryClient.invalidateQueries(); }} />
          </>
        ) : null}
      </Card>
      {showCreate ? <CreateEmployeeDialog onClose={() => setShowCreate(false)} /> : null}
    </>
  );
}
