import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditEventDto, Paginated } from '@umu-hr/shared';
import { api, qs } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination } from '../components/ui';
import { formatDateTime } from '../format';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });

  const events = useQuery({
    queryKey: ['audit', { page, filters }],
    queryFn: () => api<Paginated<AuditEventDto>>(`/audit${qs({ page, pageSize: 20, ...filters })}`),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ action, entityType, from, to });
  }

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Immutable record of security and HR actions" />
      <Card>
        <form onSubmit={submit} className="mb-5 grid gap-3 sm:grid-cols-5">
          <input className={inputClass} placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} />
          <input className={inputClass} placeholder="Entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          <Field label="From"><input className={inputClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input className={inputClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex items-end"><Button type="submit" variant="secondary">Apply filters</Button></div>
        </form>

        {events.isLoading ? <Loading /> : null}
        {events.isError ? <ErrorBlock message={events.error.message} /> : null}
        {events.data?.items.length === 0 ? <EmptyState message="No audit events match your filters" /> : null}
        {events.data && events.data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th><th>IP</th></tr></thead>
                <tbody>
                  {events.data.items.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTime(event.createdAt)}</td>
                      <td>{event.actorEmail ?? event.actorUserId ?? 'System'}</td>
                      <td><Badge>{event.action}</Badge></td>
                      <td>{event.entityType}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</td>
                      <td>{event.reason ?? '—'}</td>
                      <td>{event.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={20} total={events.data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
