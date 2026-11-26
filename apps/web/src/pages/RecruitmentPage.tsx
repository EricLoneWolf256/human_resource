import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMPLOYMENT_TYPES,
  PANEL_ROLES,
  SCORECARD_RECOMMENDATIONS,
  applicationStatusSchema,
  interviewCreateSchema,
  isApplicationTransitionAllowed,
  offerCreateSchema,
  panelAssignmentCreateSchema,
  requisitionCreateSchema,
  requisitionDecisionSchema,
  scorecardCreateSchema,
  type ApplicationDto,
  type InterviewDto,
  type PanelAssignmentDto,
  type Paginated,
  type PanelRole,
  type ScorecardDto,
  type ScorecardRecommendation,
  type UserDto,
  type VacancyDto,
} from '@umu-hr/shared';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

const APPLICATION_ACTIONS = ['SCREENING', 'SHORTLISTED', 'REJECTED'] as const;
type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];
type ScorecardCriterionInput = { name: string; score: string; comment: string };

function statusText(value: string): string {
  return value.replace(/_/g, ' ');
}

function panelVacancyRank(vacancy: VacancyDto): number {
  if (vacancy.status === 'PUBLISHED') return 0;
  if (vacancy.publishedAt) return 1;
  return 2;
}

function workflowApplicationRank(application: ApplicationDto): number {
  if (application.status === 'SHORTLISTED' || application.status === 'INTERVIEW') return 0;
  return 1;
}

export default function RecruitmentPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [requisitionPage, setRequisitionPage] = useState(1);
  const [applicationPage, setApplicationPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [employmentType, setEmploymentType] = useState('PERMANENT');
  const [openings, setOpenings] = useState('1');
  const [closingDate, setClosingDate] = useState('');
  const [approvalTargetId, setApprovalTargetId] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [applicationTargetId, setApplicationTargetId] = useState('');
  const [applicationAction, setApplicationAction] = useState<ApplicationAction>('SCREENING');
  const [applicationNote, setApplicationNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [panelVacancyId, setPanelVacancyId] = useState('');
  const [panelUserId, setPanelUserId] = useState('');
  const [panelRole, setPanelRole] = useState<PanelRole>('MEMBER');
  const [interviewApplicationId, setInterviewApplicationId] = useState('');
  const [interviewScheduledAt, setInterviewScheduledAt] = useState('');
  const [interviewPanelId, setInterviewPanelId] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [interviewNote, setInterviewNote] = useState('');
  const [scorecardApplicationId, setScorecardApplicationId] = useState('');
  const [scorecardRecommendation, setScorecardRecommendation] = useState<ScorecardRecommendation>('YES');
  const [scorecardStrengths, setScorecardStrengths] = useState('');
  const [scorecardConcerns, setScorecardConcerns] = useState('');
  const [scorecardCriteria, setScorecardCriteria] = useState<ScorecardCriterionInput[]>([
    { name: '', score: '3', comment: '' },
  ]);
  const [offerTargetId, setOfferTargetId] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [offerDetails, setOfferDetails] = useState('');

  const requisitions = useQuery({
    queryKey: ['recruitment', 'requisitions', requisitionPage],
    queryFn: () => pageApi<Paginated<VacancyDto> | VacancyDto[]>(`/recruitment/requisitions?page=${requisitionPage}&pageSize=20`),
  });
  const applications = useQuery({
    queryKey: ['recruitment', 'applications', applicationPage],
    queryFn: () => pageApi<Paginated<ApplicationDto> | ApplicationDto[]>(`/recruitment/applications?page=${applicationPage}&pageSize=20`),
  });
  const panels = useQuery({
    queryKey: ['recruitment', 'panels'],
    queryFn: () => pageApi<Paginated<PanelAssignmentDto> | PanelAssignmentDto[]>('/recruitment/panels'),
  });
  const units = useQuery({
    queryKey: ['org-units', 'all'],
    queryFn: () => pageApi<Paginated<{ id: string; name: string }>>('/org/units?pageSize=100'),
  });
  const activeUsers = useQuery({
    queryKey: ['access-users', 'active'],
    queryFn: () => pageApi<Paginated<UserDto> | UserDto[]>('/access/users?status=ACTIVE&pageSize=100'),
    enabled: hasPermission('panel.manage'),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['recruitment'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function resetCreateForm(): void {
    setCode('');
    setTitle('');
    setUnitId('');
    setEmploymentType('PERMANENT');
    setOpenings('1');
    setClosingDate('');
  }

  const createRequisition = useMutation({
    mutationFn: (input: unknown) => pageApi<VacancyDto>('/recruitment/requisitions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      setShowCreate(false);
      resetCreateForm();
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const submitRequisition = useMutation({
    mutationFn: (id: string) => pageApi<VacancyDto>(`/recruitment/requisitions/${id}/submit`, { method: 'POST' }),
    onSuccess: () => invalidate(),
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const approveRequisition = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      pageApi<VacancyDto>(`/recruitment/requisitions/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify(requisitionDecisionSchema.parse({ action: 'APPROVE', comment })),
      }),
    onSuccess: () => {
      setApprovalTargetId('');
      setApprovalComment('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const publishRequisition = useMutation({
    mutationFn: (id: string) => pageApi<VacancyDto>(`/recruitment/requisitions/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    onSuccess: () => invalidate(),
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const changeApplicationStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: ApplicationAction; note: string }) =>
      pageApi<ApplicationDto>(`/recruitment/applications/${id}/status`, {
        method: 'POST',
        body: JSON.stringify(applicationStatusSchema.parse({ status, note })),
      }),
    onSuccess: () => {
      setApplicationTargetId('');
      setApplicationNote('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const createPanelAssignment = useMutation({
    mutationFn: (input: unknown) => pageApi<PanelAssignmentDto>('/recruitment/panels', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      setPanelVacancyId('');
      setPanelUserId('');
      setPanelRole('MEMBER');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const createInterview = useMutation({
    mutationFn: (input: unknown) => pageApi<InterviewDto>('/recruitment/interviews', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      setInterviewApplicationId('');
      setInterviewScheduledAt('');
      setInterviewPanelId('');
      setInterviewLocation('');
      setInterviewNote('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const createScorecard = useMutation({
    mutationFn: (input: unknown) => pageApi<ScorecardDto>('/recruitment/scorecards', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      setScorecardApplicationId('');
      setScorecardRecommendation('YES');
      setScorecardStrengths('');
      setScorecardConcerns('');
      setScorecardCriteria([{ name: '', score: '3', comment: '' }]);
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const createOffer = useMutation({
    mutationFn: ({ id, note, details }: { id: string; note: string; details: string }) =>
      pageApi<ApplicationDto>(`/recruitment/applications/${id}/offer`, {
        method: 'POST',
        body: JSON.stringify(offerCreateSchema.parse({ note, offerDetails: details })),
      }),
    onSuccess: () => {
      setOfferTargetId('');
      setOfferNote('');
      setOfferDetails('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const exportCandidates = useMutation({
    mutationFn: () => pageApi<string>('/recruitment/applications/export', { headers: { Accept: 'text/csv' } }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'candidates.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreate(event: FormEvent): void {
    event.preventDefault();
    setActionError('');
    try {
      const input = requisitionCreateSchema.parse({
        code,
        title,
        unitId,
        employmentType,
        openings: Number(openings),
        closingDate,
      });
      createRequisition.mutate(input);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid requisition details');
    }
  }

  function submitApproval(event: FormEvent, id: string): void {
    event.preventDefault();
    setActionError('');
    const comment = approvalComment.trim();
    if (comment.length < 3) {
      setActionError('Enter an approval comment of at least 3 characters.');
      return;
    }
    approveRequisition.mutate({ id, comment });
  }

  function submitApplicationAction(event: FormEvent, application: ApplicationDto): void {
    event.preventDefault();
    setActionError('');
    const note = applicationNote.trim();
    if (note.length < 3) {
      setActionError('Enter a note of at least 3 characters.');
      return;
    }
    if (!isApplicationTransitionAllowed(application.status, applicationAction)) {
      setActionError(`Cannot change status from ${statusText(application.status)} to ${statusText(applicationAction)}.`);
      return;
    }
    try {
      applicationStatusSchema.parse({ status: applicationAction, note });
      changeApplicationStatus.mutate({ id: application.id, status: applicationAction, note });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Invalid application note');
    }
  }

  function submitPanelAssignment(event: FormEvent): void {
    event.preventDefault();
    setActionError('');
    try {
      const input = panelAssignmentCreateSchema.parse({
        vacancyId: panelVacancyId,
        userId: panelUserId,
        role: panelRole,
      });
      createPanelAssignment.mutate(input);
    } catch (caught) {
      setActionError(pageErrorMessage(caught));
    }
  }

  function submitInterview(event: FormEvent): void {
    event.preventDefault();
    setActionError('');
    try {
      const input = interviewCreateSchema.parse({
        applicationId: interviewApplicationId,
        panelAssignmentId: interviewPanelId || null,
        scheduledAt: new Date(interviewScheduledAt).toISOString(),
        location: interviewLocation,
        note: interviewNote,
      });
      createInterview.mutate(input);
    } catch (caught) {
      setActionError(pageErrorMessage(caught));
    }
  }

  function submitScorecard(event: FormEvent): void {
    event.preventDefault();
    setActionError('');
    try {
      const input = scorecardCreateSchema.parse({
        applicationId: scorecardApplicationId,
        criteria: scorecardCriteria.map((criterion) => ({
          name: criterion.name,
          score: Number(criterion.score),
          comment: criterion.comment,
        })),
        recommendation: scorecardRecommendation,
        strengths: scorecardStrengths,
        concerns: scorecardConcerns,
      });
      createScorecard.mutate(input);
    } catch (caught) {
      setActionError(pageErrorMessage(caught));
    }
  }

  function submitOffer(event: FormEvent, id: string): void {
    event.preventDefault();
    setActionError('');
    createOffer.mutate({ id, note: offerNote, details: offerDetails });
  }

  const requisitionItems = listItems(requisitions.data);
  const applicationItems = listItems(applications.data);
  const panelItems = listItems(panels.data);
  const unitItems = listItems(units.data);
  const activeUserItems = listItems(activeUsers.data);
  const panelVacancyItems = [...requisitionItems].sort((left, right) =>
    panelVacancyRank(left) - panelVacancyRank(right));
  const workflowApplicationItems = [...applicationItems].sort((left, right) =>
    workflowApplicationRank(left) - workflowApplicationRank(right));

  return (
    <>
      <PageHeader
        title="Recruitment"
        subtitle="Requisitions, candidates and interview panels"
        actions={(
          <>
            {hasPermission('candidate.export') ? (
              <Button
                variant="secondary"
                onClick={() => { setActionError(''); exportCandidates.mutate(); }}
                disabled={exportCandidates.isPending}
              >
                {exportCandidates.isPending ? 'Exporting…' : 'Export CSV'}
              </Button>
            ) : null}
            {hasPermission('recruitment.create') ? (
              <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Hide form' : 'New requisition'}</Button>
            ) : null}
          </>
        )}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {hasPermission('recruitment.create') && showCreate ? (
        <Card title="Create requisition" className="mb-6">
          {units.isError ? <ErrorBlock message={pageErrorMessage(units.error)} /> : null}
          <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-3">
            <Field label="Code">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                pattern="[A-Z0-9-]{2,20}"
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Title"><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={120} required /></Field>
            <Field label="Unit">
              <select className={inputClass} value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
                <option value="">Select unit</option>
                {unitItems.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </Field>
            <Field label="Employment type">
              <select className={inputClass} value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} required>
                {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{statusText(type)}</option>)}
              </select>
            </Field>
            <Field label="Openings"><input className={inputClass} type="number" min={1} max={50} value={openings} onChange={(event) => setOpenings(event.target.value)} required /></Field>
            <Field label="Closing date"><input className={inputClass} type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} required /></Field>
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" disabled={createRequisition.isPending}>
                {createRequisition.isPending ? 'Creating…' : 'Create requisition'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Requisitions" className="mb-6">
        {requisitions.isLoading ? <Loading /> : null}
        {requisitions.isError ? <ErrorBlock message={pageErrorMessage(requisitions.error)} /> : null}
        {!requisitions.isLoading && !requisitions.isError && requisitionItems.length === 0 ? (
          <EmptyState message="No requisitions found" />
        ) : null}
        {requisitionItems.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Title</th><th>Unit</th><th>Type</th><th>Openings</th><th>Closing</th><th>Status</th><th>Published</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {requisitionItems.map((vacancy) => {
                    const canSubmit = vacancy.status === 'DRAFT' && hasPermission('recruitment.manage');
                    const canApprove = vacancy.status === 'PENDING_APPROVAL' && hasPermission('recruitment.approve');
                    const canPublish = vacancy.status === 'APPROVED' && hasPermission('vacancy.publish');
                    return (
                      <tr key={vacancy.id}>
                        <td className="font-medium">{vacancy.code}</td>
                        <td>{vacancy.title}</td>
                        <td>{vacancy.unitName}</td>
                        <td>{statusText(vacancy.employmentType)}</td>
                        <td>{vacancy.openings}</td>
                        <td>{formatDate(vacancy.closingDate)}</td>
                        <td><Badge tone={toneForStatus(vacancy.status)}>{statusText(vacancy.status)}</Badge></td>
                        <td>{formatDateTime(vacancy.publishedAt)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {canSubmit ? (
                              <button
                                className="text-brand-600 hover:underline"
                                disabled={submitRequisition.isPending}
                                onClick={() => { setActionError(''); submitRequisition.mutate(vacancy.id); }}
                              >
                                Submit
                              </button>
                            ) : null}
                            {canApprove ? (
                              <button
                                className="text-brand-600 hover:underline"
                                onClick={() => {
                                  setApprovalTargetId(vacancy.id);
                                  setApprovalComment('');
                                  setActionError('');
                                }}
                              >
                                Approve
                              </button>
                            ) : null}
                            {canPublish ? (
                              <button
                                className="text-brand-600 hover:underline"
                                disabled={publishRequisition.isPending}
                                onClick={() => { setActionError(''); publishRequisition.mutate(vacancy.id); }}
                              >
                                Publish
                              </button>
                            ) : null}
                            {!canSubmit && !canApprove && !canPublish ? <span className="text-slate-400">—</span> : null}
                          </div>
                          {approvalTargetId === vacancy.id && canApprove ? (
                            <form onSubmit={(event) => submitApproval(event, vacancy.id)} className="mt-2 space-y-2">
                              <Field label="Approval comment">
                                <textarea
                                  className={inputClass}
                                  rows={2}
                                  value={approvalComment}
                                  onChange={(event) => setApprovalComment(event.target.value)}
                                  minLength={3}
                                  maxLength={1000}
                                  required
                                />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={approveRequisition.isPending}>Confirm approval</Button>
                                <Button type="button" variant="secondary" onClick={() => setApprovalTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={requisitionPage} pageSize={20} total={listTotal(requisitions.data)} onPage={setRequisitionPage} />
          </>
        ) : null}
      </Card>

      <Card title="Applications" className="mb-6">
        {applications.isLoading ? <Loading /> : null}
        {applications.isError ? <ErrorBlock message={pageErrorMessage(applications.error)} /> : null}
        {!applications.isLoading && !applications.isError && applicationItems.length === 0 ? (
          <EmptyState message="No applications found" />
        ) : null}
        {applicationItems.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Reference</th><th>Vacancy</th><th>Applicant</th><th>Status</th><th>Submitted</th><th>Decision note</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {applicationItems.map((application) => {
                    const allowedActions = APPLICATION_ACTIONS.filter((status) =>
                      isApplicationTransitionAllowed(application.status, status));
                    const canManageStatus = hasPermission('recruitment.manage') && allowedActions.length > 0;
                    const canOffer = (application.status === 'SHORTLISTED' || application.status === 'INTERVIEW')
                      && hasPermission('recruitment.approve');
                    return (
                      <tr key={application.id}>
                        <td className="font-medium">{application.reference}</td>
                        <td>{application.vacancyTitle}</td>
                        <td>{application.applicantName}<span className="block text-xs text-slate-400">{application.email}</span></td>
                        <td><Badge tone={toneForStatus(application.status)}>{statusText(application.status)}</Badge></td>
                        <td>{formatDateTime(application.submittedAt)}</td>
                        <td>{application.decisionNote ?? application.screeningNote ?? '—'}</td>
                        <td>
                          {canManageStatus || canOffer ? (
                            <div className="flex flex-wrap gap-2">
                              {allowedActions.map((status) => (
                                <button
                                  key={status}
                                  className="text-brand-600 hover:underline"
                                  onClick={() => {
                                    setApplicationTargetId(application.id);
                                    setApplicationAction(status);
                                    setApplicationNote('');
                                    setOfferTargetId('');
                                    setActionError('');
                                  }}
                                >
                                  {statusText(status)}
                                </button>
                              ))}
                              {canOffer ? (
                                <button
                                  className="text-brand-600 hover:underline"
                                  onClick={() => {
                                    setOfferTargetId(application.id);
                                    setOfferNote('');
                                    setOfferDetails('');
                                    setApplicationTargetId('');
                                    setActionError('');
                                  }}
                                >
                                  Offer
                                </button>
                              ) : null}
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                          {applicationTargetId === application.id && hasPermission('recruitment.manage') ? (
                            <form onSubmit={(event) => submitApplicationAction(event, application)} className="mt-2 space-y-2">
                              <Field label="Status">
                                <select
                                  className={inputClass}
                                  value={applicationAction}
                                  onChange={(event) => setApplicationAction(event.target.value as ApplicationAction)}
                                >
                                  {allowedActions.map((status) => <option key={status} value={status}>{statusText(status)}</option>)}
                                </select>
                              </Field>
                              <Field label="Note">
                                <textarea
                                  className={inputClass}
                                  rows={2}
                                  value={applicationNote}
                                  onChange={(event) => setApplicationNote(event.target.value)}
                                  minLength={3}
                                  maxLength={1000}
                                  required
                                />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={changeApplicationStatus.isPending}>Save status</Button>
                                <Button type="button" variant="secondary" onClick={() => setApplicationTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                          {offerTargetId === application.id && canOffer ? (
                            <form onSubmit={(event) => submitOffer(event, application.id)} className="mt-2 space-y-2">
                              <Field label="Offer note">
                                <textarea
                                  className={inputClass}
                                  rows={2}
                                  value={offerNote}
                                  onChange={(event) => setOfferNote(event.target.value)}
                                  minLength={3}
                                  maxLength={1000}
                                  required
                                />
                              </Field>
                              <Field label="Offer details">
                                <textarea
                                  className={inputClass}
                                  rows={3}
                                  value={offerDetails}
                                  onChange={(event) => setOfferDetails(event.target.value)}
                                  minLength={3}
                                  maxLength={2000}
                                  required
                                />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={createOffer.isPending}>Make offer</Button>
                                <Button type="button" variant="secondary" onClick={() => setOfferTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={applicationPage} pageSize={20} total={listTotal(applications.data)} onPage={setApplicationPage} />
          </>
        ) : null}
      </Card>

      {hasPermission('panel.manage') ? (
        <Card title="Panel assignment" className="mb-6">
          {activeUsers.isError ? <ErrorBlock message={pageErrorMessage(activeUsers.error)} /> : null}
          <form onSubmit={submitPanelAssignment} className="grid gap-4 sm:grid-cols-4">
            <Field label="Vacancy">
              <select
                className={inputClass}
                value={panelVacancyId}
                onChange={(event) => setPanelVacancyId(event.target.value)}
                required
              >
                <option value="">Select vacancy</option>
                {panelVacancyItems.map((vacancy) => (
                  <option key={vacancy.id} value={vacancy.id}>
                    {vacancy.code} — {vacancy.title} ({statusText(vacancy.status)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="User">
              <select
                className={inputClass}
                value={panelUserId}
                onChange={(event) => setPanelUserId(event.target.value)}
                required
              >
                <option value="">Select user</option>
                {activeUserItems.map((user) => (
                  <option key={user.id} value={user.id}>{user.employeeName ?? user.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={panelRole}
                onChange={(event) => setPanelRole(event.target.value as PanelRole)}
                required
              >
                {PANEL_ROLES.map((role) => <option key={role} value={role}>{statusText(role)}</option>)}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={createPanelAssignment.isPending}>
                {createPanelAssignment.isPending ? 'Assigning…' : 'Assign panel member'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {hasPermission('interview.manage') ? (
        <Card title="Interview scheduling" className="mb-6">
          <form onSubmit={submitInterview} className="grid gap-4 sm:grid-cols-3">
            <Field label="Application">
              <select
                className={inputClass}
                value={interviewApplicationId}
                onChange={(event) => setInterviewApplicationId(event.target.value)}
                required
              >
                <option value="">Select application</option>
                {workflowApplicationItems.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.reference} — {application.applicantName} ({statusText(application.status)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scheduled at">
              <input
                className={inputClass}
                type="datetime-local"
                value={interviewScheduledAt}
                onChange={(event) => setInterviewScheduledAt(event.target.value)}
                required
              />
            </Field>
            <Field label="Panel assignment">
              <select
                className={inputClass}
                value={interviewPanelId}
                onChange={(event) => setInterviewPanelId(event.target.value)}
              >
                <option value="">No panel assignment</option>
                {panelItems.map((panel) => (
                  <option key={panel.id} value={panel.id}>
                    {panel.vacancyTitle} — {panel.userName} ({statusText(panel.role)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                className={inputClass}
                value={interviewLocation}
                onChange={(event) => setInterviewLocation(event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Note">
              <textarea
                className={inputClass}
                rows={2}
                value={interviewNote}
                onChange={(event) => setInterviewNote(event.target.value)}
                maxLength={1000}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={createInterview.isPending}>
                {createInterview.isPending ? 'Scheduling…' : 'Schedule interview'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {hasPermission('candidate.score') ? (
        <Card title="Scorecard" className="mb-6">
          <form onSubmit={submitScorecard} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application">
                <select
                  className={inputClass}
                  value={scorecardApplicationId}
                  onChange={(event) => setScorecardApplicationId(event.target.value)}
                  required
                >
                  <option value="">Select application</option>
                  {workflowApplicationItems.map((application) => (
                    <option key={application.id} value={application.id}>
                      {application.reference} — {application.applicantName} ({statusText(application.status)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recommendation">
                <select
                  className={inputClass}
                  value={scorecardRecommendation}
                  onChange={(event) => setScorecardRecommendation(event.target.value as ScorecardRecommendation)}
                  required
                >
                  {SCORECARD_RECOMMENDATIONS.map((recommendation) => (
                    <option key={recommendation} value={recommendation}>{statusText(recommendation)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Strengths">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={scorecardStrengths}
                  onChange={(event) => setScorecardStrengths(event.target.value)}
                  maxLength={2000}
                />
              </Field>
              <Field label="Concerns">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={scorecardConcerns}
                  onChange={(event) => setScorecardConcerns(event.target.value)}
                  maxLength={2000}
                />
              </Field>
            </div>
            <div className="space-y-3">
              {scorecardCriteria.map((criterion, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-4">
                  <Field label={`Criterion ${index + 1}`}>
                    <input
                      className={inputClass}
                      value={criterion.name}
                      onChange={(event) => setScorecardCriteria((current) => current.map((item, position) =>
                        position === index ? { ...item, name: event.target.value } : item))}
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </Field>
                  <Field label="Score">
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={5}
                      value={criterion.score}
                      onChange={(event) => setScorecardCriteria((current) => current.map((item, position) =>
                        position === index ? { ...item, score: event.target.value } : item))}
                      required
                    />
                  </Field>
                  <Field label="Comment">
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={criterion.comment}
                      onChange={(event) => setScorecardCriteria((current) => current.map((item, position) =>
                        position === index ? { ...item, comment: event.target.value } : item))}
                      maxLength={500}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={scorecardCriteria.length === 1}
                      onClick={() => setScorecardCriteria((current) => current.filter((_, position) => position !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={scorecardCriteria.length >= 10}
                onClick={() => setScorecardCriteria((current) => [...current, { name: '', score: '3', comment: '' }])}
              >
                Add criterion
              </Button>
              <Button type="submit" disabled={createScorecard.isPending}>
                {createScorecard.isPending ? 'Submitting…' : 'Submit scorecard'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Interview panels">
        {panels.isLoading ? <Loading /> : null}
        {panels.isError ? <ErrorBlock message={pageErrorMessage(panels.error)} /> : null}
        {!panels.isLoading && !panels.isError && panelItems.length === 0 ? (
          <EmptyState message="No panel assignments found" />
        ) : null}
        {panelItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Vacancy</th><th>Member</th><th>Role</th><th>Assigned</th></tr>
              </thead>
              <tbody>
                {panelItems.map((panel) => (
                  <tr key={panel.id}>
                    <td className="font-medium">{panel.vacancyTitle}</td>
                    <td>{panel.userName}</td>
                    <td>{statusText(panel.role)}</td>
                    <td>{formatDateTime(panel.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
