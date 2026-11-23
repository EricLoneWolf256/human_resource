import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, Paginated } from '@umu-hr/shared';
import { api, qs } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader, Pagination, toneForStatus } from '../components/ui';
import { formatDateTime } from '../format';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notifications = useQuery({
    queryKey: ['notifications', { page, unreadOnly }],
    queryFn: () => api<Paginated<NotificationDto>>(`/notifications${qs({ page, pageSize: 20, unreadOnly })}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Security, access and HR updates relevant to you"
        actions={
          <>
            <Button variant="secondary" onClick={() => { setPage(1); setUnreadOnly((value) => !value); }}>
              {unreadOnly ? 'Show all' : 'Unread only'}
            </Button>
            <Button variant="secondary" onClick={() => markAll.mutate()}>Mark all read</Button>
          </>
        }
      />
      <Card>
        {notifications.isLoading ? <Loading /> : null}
        {notifications.isError ? <ErrorBlock message={notifications.error.message} /> : null}
        {notifications.data?.items.length === 0 ? <EmptyState message="No notifications" /> : null}
        {notifications.data && notifications.data.items.length > 0 ? (
          <>
            <div className="space-y-3">
              {notifications.data.items.map((item) => (
                <div key={item.id} className={`rounded-lg border p-4 ${item.readAt ? 'border-slate-200 bg-white' : 'border-brand-100 bg-brand-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge tone={toneForStatus(item.priority)}>{item.priority}</Badge>
                      {!item.readAt ? (
                        <button className="text-sm text-brand-600 hover:underline" onClick={() => markRead.mutate(item.id)}>Mark read</button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.safeSummary}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.createdAt)} · {item.eventType}</p>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={20} total={notifications.data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
