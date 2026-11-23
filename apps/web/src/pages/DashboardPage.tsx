import { useQuery } from '@tanstack/react-query';
import type { DashboardPayload } from '@umu-hr/shared';
import { api } from '../api';
import { Badge, Card, EmptyState, ErrorBlock, Loading, PageHeader, TextLink, toneForStatus } from '../components/ui';
import { formatDate } from '../format';

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-400">{note}</p> : null}
    </Card>
  );
}

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardPayload>('/dashboard'),
  });

  if (dashboard.isLoading) return <Loading />;
  if (dashboard.isError) return <ErrorBlock message={dashboard.error.message} />;
  const data = dashboard.data;
  if (!data) return <EmptyState message="No dashboard data available" />;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data.scopeLabel} />
      <div className="grid-cards">
        <Stat label="Unread notifications" value={data.unreadNotifications} />
        {data.headcount ? <Stat label="Employees in scope" value={data.headcount.total} note={`${Object.keys(data.headcount.byStatus).length} status groups`} /> : null}
        {data.pendingChangeRequests !== null ? <Stat label="Pending corrections" value={data.pendingChangeRequests} /> : null}
        {data.pendingDocuments !== null ? <Stat label="Documents to verify" value={data.pendingDocuments} /> : null}
        {data.profile ? (
          <Stat label="Profile completeness" value={`${data.profile.completenessPercent}%`} note={data.profile.profileStatus} />
        ) : null}
        {data.admin ? <Stat label="Active role assignments" value={data.admin.activeRoleAssignments} note={`${data.admin.expiringAssignments7d} expiring in 7 days`} /> : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Recent hires">
          {data.recentHires.length === 0 ? (
            <EmptyState message="No hires in the last 30 days" />
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Staff number</th><th>Hire date</th><th>Unit</th></tr></thead>
              <tbody>
                {data.recentHires.map((item) => (
                  <tr key={item.id}>
                    <td><TextLink to={`/employees/${item.id}`}>{item.fullName}</TextLink></td>
                    <td>{item.staffNumber}</td>
                    <td>{formatDate(item.hireDate)}</td>
                    <td>{item.unitName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Contracts expiring soon">
          {data.expiringContracts.length === 0 ? (
            <EmptyState message="No expiring contracts in the next 90 days" />
          ) : (
            <table className="table">
              <thead><tr><th>Document</th><th>Employee</th><th>Expiry</th></tr></thead>
              <tbody>
                {data.expiringContracts.map((item) => (
                  <tr key={item.documentId}>
                    <td>{item.title}</td>
                    <td>{item.employeeName}</td>
                    <td>{formatDate(item.expiryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {data.admin ? (
          <Card title="Recent audit activity">
            {data.admin.recentAudit.length === 0 ? (
              <EmptyState message="No audit events yet" />
            ) : (
              <table className="table">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
                <tbody>
                  {data.admin.recentAudit.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.createdAt)}</td>
                      <td>{event.actorEmail ?? 'System'}</td>
                      <td><Badge tone={toneForStatus(event.action)}>{event.action}</Badge></td>
                      <td>{event.entityType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ) : null}

        {data.profile ? (
          <Card title="My profile">
            <p className="text-sm text-slate-700">Staff number: {data.profile.staffNumber}</p>
            <p className="mt-1 text-sm text-slate-700">Profile status: {data.profile.profileStatus}</p>
            <p className="mt-1 text-sm text-slate-700">Documents: {data.profile.documentCount}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
