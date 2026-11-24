import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractDto, Paginated, ProbationRecordDto, ReminderDto } from '@umu-hr/shared';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader, Pagination, toneForStatus } from '../components/ui';
import { formatDate } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

type TabKey = 'contracts' | 'probations' | 'reminders';

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<TabKey>('contracts');
  const [actionError, setActionError] = useState('');

  const contracts = useQuery({
    queryKey: ['contracts', page],
    queryFn: () => pageApi<Paginated<ContractDto> | ContractDto[]>(`/contracts?page=${page}&pageSize=20`),
  });
  const probations = useQuery({
    queryKey: ['probations'],
    queryFn: () => pageApi<Paginated<ProbationRecordDto> | ProbationRecordDto[]>('/contracts/probations'),
  });
  const reminders = useQuery({
    queryKey: ['reminders'],
    queryFn: () => pageApi<Paginated<ReminderDto> | ReminderDto[]>('/reminders'),
  });

  const scanReminders = useMutation({
    mutationFn: () => pageApi('/reminders/scan', { method: 'POST', body: JSON.stringify({ daysAhead: 30 }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const contractList = listItems(contracts.data);
  const probationList = listItems(probations.data);
  const reminderList = listItems(reminders.data);

  const loadError = contracts.isError
    ? pageErrorMessage(contracts.error)
    : probations.isError
      ? pageErrorMessage(probations.error)
      : reminders.isError
        ? pageErrorMessage(reminders.error)
        : '';

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'contracts', label: 'Contracts', count: listTotal(contracts.data) },
    { key: 'probations', label: 'Probations', count: listTotal(probations.data) },
    { key: 'reminders', label: 'Reminders', count: listTotal(reminders.data) },
  ];

  return (
    <>
      <PageHeader
        title="Contracts"
        subtitle="Contracts, probation reviews and upcoming reminders"
        actions={<Button variant="secondary" onClick={() => scanReminders.mutate()} disabled={scanReminders.isPending}>Scan reminders</Button>}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}
      {contracts.isLoading || probations.isLoading || reminders.isLoading ? <Loading label="Loading contracts data…" /> : null}
      {loadError ? <ErrorBlock message={loadError} /> : null}

      <Card>
        <div role="tablist" aria-label="Contracts sections" className="mb-5 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === item.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label} <span className="opacity-75">({item.count})</span>
            </button>
          ))}
        </div>

        {tab === 'contracts' ? (
          contractList.length === 0 ? <EmptyState message="No contracts found" /> : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Employee</th><th>Type</th><th>Status</th><th>Renewal</th><th>Start</th><th>End</th></tr></thead>
                  <tbody>
                    {contractList.map((contract) => (
                      <tr key={contract.id}>
                        <td className="font-medium">{contract.employeeName}</td>
                        <td>{contract.type.replace('_', ' ')}</td>
                        <td><Badge tone={toneForStatus(contract.status)}>{contract.status}</Badge></td>
                        <td><Badge tone={toneForStatus(contract.renewalStatus)}>{contract.renewalStatus}</Badge></td>
                        <td>{formatDate(contract.startDate)}</td>
                        <td>{formatDate(contract.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={20} total={listTotal(contracts.data)} onPage={setPage} />
            </>
          )
        ) : null}

        {tab === 'probations' ? (
          probationList.length === 0 ? <EmptyState message="No probation records found" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Employee</th><th>Start</th><th>End</th><th>Review date</th><th>Outcome</th><th>Reviewed by</th></tr></thead>
                <tbody>
                  {probationList.map((record) => (
                    <tr key={record.id}>
                      <td className="font-medium">{record.employeeName}</td>
                      <td>{formatDate(record.startDate)}</td>
                      <td>{formatDate(record.endDate)}</td>
                      <td>{formatDate(record.reviewDate)}</td>
                      <td><Badge tone={toneForStatus(record.outcome)}>{record.outcome}</Badge></td>
                      <td>{record.reviewedByName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'reminders' ? (
          reminderList.length === 0 ? <EmptyState message="No reminders found" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Type</th><th>Entity</th><th>Recipient</th><th>Due</th><th>Status</th><th>Message</th></tr></thead>
                <tbody>
                  {reminderList.map((reminder) => (
                    <tr key={reminder.id}>
                      <td>{reminder.type.replace('_', ' ')}</td>
                      <td>{reminder.entityType} · {reminder.entityId.slice(0, 8)}</td>
                      <td>{reminder.recipientName}</td>
                      <td>{formatDate(reminder.dueDate)}</td>
                      <td><Badge tone={toneForStatus(reminder.status)}>{reminder.status}</Badge></td>
                      <td className="max-w-sm">{reminder.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Card>
    </>
  );
}
