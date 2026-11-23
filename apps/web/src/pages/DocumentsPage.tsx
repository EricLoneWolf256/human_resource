import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  SENSITIVITY_LEVELS,
  documentRejectSchema,
  documentUploadMetaSchema,
  type DocumentDto,
  type EmployeeListItem,
  type Paginated,
} from '@umu-hr/shared';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatBytes, formatDate } from '../format';

function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [sensitivity, setSensitivity] = useState<string>(SENSITIVITY_LEVELS[1]);
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const employees = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api<Paginated<EmployeeListItem>>(`/employees${qs({ pageSize: 100 })}`),
  });

  const mutation = useMutation({
    mutationFn: (form: FormData) => api<DocumentDto>('/documents', { method: 'POST', body: form }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a PDF, PNG or JPEG file');
      return;
    }
    try {
      const meta = documentUploadMetaSchema.parse({
        employeeId,
        category,
        title,
        sensitivity,
        expiryDate: expiryDate || undefined,
      });
      const form = new FormData();
      form.append('file', file);
      for (const [key, value] of Object.entries(meta)) {
        if (value !== undefined) form.append(key, String(value));
      }
      mutation.mutate(form);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upload document</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>Close</button>
        </div>
        {error ? <ErrorBlock message={error} /> : null}
        <Field label="Employee">
          <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="">Select employee</option>
            {employees.data?.items.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.staffNumber} — {employee.fullName}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Sensitivity">
            <select className={inputClass} value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
              {SENSITIVITY_LEVELS.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Title"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expiry date (optional)"><input className={inputClass} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
          <Field label="File (PDF, PNG, JPEG; max 5 MB)">
            <input className={inputClass} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </Field>
        </div>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Uploading…' : 'Upload'}</Button>
      </form>
    </div>
  );
}

export default function DocumentsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState('');

  const documents = useQuery({
    queryKey: ['documents', { page, search, category, status }],
    queryFn: () => api<Paginated<DocumentDto>>(`/documents${qs({ page, pageSize: 20, q: search, category, status })}`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['documents'] });

  const verify = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}/verify`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
    onError: (caught: Error) => setError(caught.message),
  });
  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api(`/documents/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setError(caught.message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'Archived from document register' }) }),
    onSuccess: invalidate,
    onError: (caught: Error) => setError(caught.message),
  });

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Metadata register and verification queue"
        actions={hasPermission('document.upload') ? <Button onClick={() => setShowUpload(true)}>Upload document</Button> : null}
      />
      {error ? <ErrorBlock message={error} /> : null}
      <Card>
        <form
          className="mb-5 grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(q); }}
        >
          <input className={inputClass} placeholder="Search title or filename" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputClass} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {DOCUMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
          </select>
          <select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {DOCUMENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {documents.isLoading ? <Loading /> : null}
        {documents.isError ? <ErrorBlock message={documents.error.message} /> : null}
        {documents.data?.items.length === 0 ? <EmptyState message="No documents match your filters" /> : null}
        {documents.data && documents.data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Title</th><th>Employee</th><th>Category</th><th>Version</th><th>Size</th><th>Expiry</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {documents.data.items.map((document) => (
                    <tr key={document.id}>
                      <td className="font-medium">{document.title}</td>
                      <td>{document.employeeName ?? '—'}</td>
                      <td>{document.category.replace('_', ' ')}</td>
                      <td>v{document.version}</td>
                      <td>{formatBytes(document.sizeBytes)}</td>
                      <td>{formatDate(document.expiryDate)}</td>
                      <td><Badge tone={toneForStatus(document.status)}>{document.status}</Badge></td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {hasPermission('document.download') ? (
                            <button className="text-brand-600 hover:underline" onClick={() => { window.location.href = `/api/documents/${document.id}/download`; }}>Download</button>
                          ) : null}
                          {hasPermission('document.verify') && document.status === 'PENDING' ? (
                            <>
                              <button className="text-brand-600 hover:underline" onClick={() => verify.mutate(document.id)}>Verify</button>
                              <button
                                className="text-rose-600 hover:underline"
                                onClick={() => {
                                  const note = window.prompt('Reason for rejection', '');
                                  if (note) {
                                    try { reject.mutate({ id: document.id, note: documentRejectSchema.parse({ note }).note }); }
                                    catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid reason'); }
                                  }
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {hasPermission('document.delete') ? (
                            <button className="text-slate-500 hover:underline" onClick={() => archive.mutate(document.id)}>Archive</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={documents.data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>
      {showUpload ? <UploadDialog onClose={() => setShowUpload(false)} /> : null}
    </>
  );
}
