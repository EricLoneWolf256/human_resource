import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AppraisalCycleDto, type AppraisalDto, type Paginated } from '@umu-hr/shared';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

type CycleAction = 'open' | 'close' | 'archive';
type ReviewStage = 'SUPERVISOR' | 'HOD' | 'HR';

interface CreateCycleInput {
  code: string;
  name: string;
  templateType: AppraisalCycleDto['templateType'];
  startDate: string;
  endDate: string;
}

interface ObjectiveRatingInput {
  id: string;
  rating: number;
}

interface SelfReviewInput {
  id: string;
  selfRating: number;
  selfComment: string;
  developmentPlan: string;
  objectiveRatings: ObjectiveRatingInput[];
}

interface ReviewInput {
  id: string;
  stage: ReviewStage;
  rating: number;
  comment: string;
  developmentPlan: string;
}

interface FinalizeInput {
  id: string;
  finalRating: number;
  comment: string;
}

function RatingSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">Select rating</option>
      {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
    </select>
  );
}

function stagesForStatus(status: AppraisalDto['status']): ReviewStage[] {
  if (status === 'SELF_REVIEW') return ['SUPERVISOR'];
  if (status === 'SUPERVISOR_REVIEW') return ['HOD'];
  if (status === 'HOD_REVIEW') return ['HR'];
  return [];
}

export default function PerformancePage() {
  const { session, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [cyclePage, setCyclePage] = useState(1);
  const [appraisalPage, setAppraisalPage] = useState(1);
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [cycleCode, setCycleCode] = useState('');
  const [cycleName, setCycleName] = useState('');
  const [templateType, setTemplateType] = useState<AppraisalCycleDto['templateType']>('ACADEMIC');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selfTargetId, setSelfTargetId] = useState('');
  const [selfRating, setSelfRating] = useState('');
  const [selfComment, setSelfComment] = useState('');
  const [developmentPlan, setDevelopmentPlan] = useState('');
  const [objectiveRatings, setObjectiveRatings] = useState<Record<string, string>>({});
  const [reviewTargetId, setReviewTargetId] = useState('');
  const [reviewStage, setReviewStage] = useState<ReviewStage>('SUPERVISOR');
  const [reviewRating, setReviewRating] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewDevelopmentPlan, setReviewDevelopmentPlan] = useState('');
  const [finalizeTargetId, setFinalizeTargetId] = useState('');
  const [finalRating, setFinalRating] = useState('');
  const [finalComment, setFinalComment] = useState('');
  const [actionError, setActionError] = useState('');

  const canCreateCycle = hasPermission('appraisal.create');
  const canReview = hasPermission('appraisal.review');
  const canFinalize = hasPermission('appraisal.finalize');

  const cycles = useQuery({
    queryKey: ['performance', 'cycles', cyclePage],
    queryFn: () => pageApi<Paginated<AppraisalCycleDto> | AppraisalCycleDto[]>(`/performance/cycles?page=${cyclePage}&pageSize=20`),
  });
  const appraisals = useQuery({
    queryKey: ['performance', 'appraisals', appraisalPage],
    queryFn: () => pageApi<Paginated<AppraisalDto> | AppraisalDto[]>(`/performance/appraisals?page=${appraisalPage}&pageSize=20`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['performance'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createCycle = useMutation({
    mutationFn: (input: CreateCycleInput) =>
      pageApi<AppraisalCycleDto>('/performance/cycles', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowCreateCycle(false);
      setCycleCode('');
      setCycleName('');
      setTemplateType('ACADEMIC');
      setStartDate('');
      setEndDate('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const changeCycleStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: CycleAction }) =>
      pageApi<AppraisalCycleDto>(`/performance/cycles/${id}/${action}`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const selfReview = useMutation({
    mutationFn: (input: SelfReviewInput) =>
      pageApi<AppraisalDto>(`/performance/appraisals/${input.id}/self-review`, {
        method: 'POST',
        body: JSON.stringify({
          selfRating: input.selfRating,
          selfComment: input.selfComment,
          developmentPlan: input.developmentPlan || undefined,
          objectiveRatings: input.objectiveRatings,
        }),
      }),
    onSuccess: () => {
      setSelfTargetId('');
      setSelfRating('');
      setSelfComment('');
      setDevelopmentPlan('');
      setObjectiveRatings({});
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const reviewAppraisal = useMutation({
    mutationFn: (input: ReviewInput) =>
      pageApi<AppraisalDto>(`/performance/appraisals/${input.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          stage: input.stage,
          rating: input.rating,
          comment: input.comment,
          developmentPlan: input.developmentPlan || undefined,
        }),
      }),
    onSuccess: () => {
      setReviewTargetId('');
      setReviewRating('');
      setReviewComment('');
      setReviewDevelopmentPlan('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const finalizeAppraisal = useMutation({
    mutationFn: (input: FinalizeInput) =>
      pageApi<AppraisalDto>(`/performance/appraisals/${input.id}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ finalRating: input.finalRating, comment: input.comment }),
      }),
    onSuccess: () => {
      setFinalizeTargetId('');
      setFinalRating('');
      setFinalComment('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreateCycle(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    createCycle.mutate({
      code: cycleCode.trim(),
      name: cycleName.trim(),
      templateType,
      startDate,
      endDate,
    });
  }

  function openSelfReview(appraisal: AppraisalDto) {
    setActionError('');
    setReviewTargetId('');
    setFinalizeTargetId('');
    setSelfTargetId(appraisal.id);
    setSelfRating('');
    setSelfComment('');
    setDevelopmentPlan('');
    const ratings: Record<string, string> = {};
    for (const objective of appraisal.objectives) ratings[objective.id] = '';
    setObjectiveRatings(ratings);
  }

  function submitSelfReviewForm(event: FormEvent, appraisal: AppraisalDto) {
    event.preventDefault();
    setActionError('');
    const rating = Number(selfRating);
    const objectiveIds = appraisal.objectives.map((objective) => objective.id);
    const objectiveInput = objectiveIds.map((id) => ({ id, rating: Number(objectiveRatings[id] ?? '') }));
    if (
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      selfComment.trim().length < 3 ||
      Object.keys(objectiveRatings).length !== objectiveIds.length ||
      objectiveInput.length !== objectiveIds.length ||
      objectiveInput.some((item) => !Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5)
    ) {
      setActionError('Provide a comment and rate every objective exactly once with a rating from 1 to 5.');
      return;
    }
    selfReview.mutate({
      id: appraisal.id,
      selfRating: rating,
      selfComment: selfComment.trim(),
      developmentPlan: developmentPlan.trim(),
      objectiveRatings: objectiveInput,
    });
  }

  function openReview(appraisal: AppraisalDto) {
    setActionError('');
    setSelfTargetId('');
    setFinalizeTargetId('');
    setReviewTargetId(appraisal.id);
    setReviewStage(stagesForStatus(appraisal.status)[0] ?? 'SUPERVISOR');
    setReviewRating('');
    setReviewComment('');
    setReviewDevelopmentPlan('');
  }

  function submitReviewForm(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    const rating = Number(reviewRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewComment.trim().length < 3) {
      setActionError('Provide a rating from 1 to 5 and a comment of at least 3 characters.');
      return;
    }
    reviewAppraisal.mutate({
      id,
      stage: reviewStage,
      rating,
      comment: reviewComment.trim(),
      developmentPlan: reviewDevelopmentPlan.trim(),
    });
  }

  function openFinalize(appraisal: AppraisalDto) {
    setActionError('');
    setSelfTargetId('');
    setReviewTargetId('');
    setFinalizeTargetId(appraisal.id);
    setFinalRating('');
    setFinalComment('');
  }

  function submitFinalizeForm(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    const rating = Number(finalRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || finalComment.trim().length < 3) {
      setActionError('Provide a final rating from 1 to 5 and a comment of at least 3 characters.');
      return;
    }
    finalizeAppraisal.mutate({ id, finalRating: rating, comment: finalComment.trim() });
  }

  function isOwnDraft(appraisal: AppraisalDto): boolean {
    return session?.employeeId === appraisal.employeeId && appraisal.status === 'DRAFT';
  }

  const cycleList = listItems(cycles.data);
  const appraisalList = listItems(appraisals.data);

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="Appraisal cycles, reviews and final ratings"
        actions={canCreateCycle ? (
          <Button variant="secondary" onClick={() => setShowCreateCycle((value) => !value)}>New appraisal cycle</Button>
        ) : null}
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreateCycle && canCreateCycle ? (
        <Card title="Create appraisal cycle" className="mb-6">
          <form onSubmit={submitCreateCycle} className="grid gap-4 sm:grid-cols-5">
            <Field label="Code">
              <input
                className={inputClass}
                value={cycleCode}
                onChange={(event) => setCycleCode(event.target.value)}
                pattern="[A-Z0-9-]{2,20}"
                required
              />
            </Field>
            <Field label="Name">
              <input className={inputClass} value={cycleName} onChange={(event) => setCycleName(event.target.value)} minLength={2} required />
            </Field>
            <Field label="Template">
              <select
                className={inputClass}
                value={templateType}
                onChange={(event) => setTemplateType(event.target.value as AppraisalCycleDto['templateType'])}
              >
                <option value="ACADEMIC">Academic</option>
                <option value="NON_ACADEMIC">Non academic</option>
              </select>
            </Field>
            <Field label="Start date"><input className={inputClass} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field>
            <Field label="End date"><input className={inputClass} type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required /></Field>
            <div className="sm:col-span-5">
              <Button type="submit" disabled={createCycle.isPending}>{createCycle.isPending ? 'Creating…' : 'Create cycle'}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Appraisal cycles" className="mb-6">
        {cycles.isLoading ? <Loading /> : null}
        {cycles.isError ? <ErrorBlock message={pageErrorMessage(cycles.error)} /> : null}
        {!cycles.isLoading && !cycles.isError && cycleList.length === 0 ? <EmptyState message="No appraisal cycles found" /> : null}
        {cycleList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Name</th><th>Template</th><th>Dates</th><th>Status</th><th>Appraisals</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {cycleList.map((cycle) => (
                    <tr key={cycle.id}>
                      <td className="font-medium">{cycle.code}</td>
                      <td>{cycle.name}</td>
                      <td>{cycle.templateType.replace('_', ' ')}</td>
                      <td>{formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}</td>
                      <td><Badge tone={toneForStatus(cycle.status)}>{cycle.status}</Badge></td>
                      <td>{cycle.appraisalCount}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {canCreateCycle && cycle.status === 'DRAFT' ? (
                            <button
                              className="text-brand-600 hover:underline"
                              disabled={changeCycleStatus.isPending}
                              onClick={() => { setActionError(''); changeCycleStatus.mutate({ id: cycle.id, action: 'open' }); }}
                            >
                              Open
                            </button>
                          ) : null}
                          {canCreateCycle && cycle.status === 'OPEN' ? (
                            <button
                              className="text-brand-600 hover:underline"
                              disabled={changeCycleStatus.isPending}
                              onClick={() => { setActionError(''); changeCycleStatus.mutate({ id: cycle.id, action: 'close' }); }}
                            >
                              Close
                            </button>
                          ) : null}
                          {canCreateCycle && cycle.status === 'CLOSED' ? (
                            <button
                              className="text-brand-600 hover:underline"
                              disabled={changeCycleStatus.isPending}
                              onClick={() => { setActionError(''); changeCycleStatus.mutate({ id: cycle.id, action: 'archive' }); }}
                            >
                              Archive
                            </button>
                          ) : null}
                          {!canCreateCycle || !['DRAFT', 'OPEN', 'CLOSED'].includes(cycle.status) ? <span className="text-slate-400">—</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={cyclePage} pageSize={20} total={listTotal(cycles.data)} onPage={setCyclePage} />
          </>
        ) : null}
      </Card>

      <Card title="Appraisals">
        {appraisals.isLoading ? <Loading /> : null}
        {appraisals.isError ? <ErrorBlock message={pageErrorMessage(appraisals.error)} /> : null}
        {!appraisals.isLoading && !appraisals.isError && appraisalList.length === 0 ? <EmptyState message="No appraisals found" /> : null}
        {appraisalList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Cycle</th><th>Status</th><th>Objectives</th><th>Self</th><th>Final</th><th>Submitted</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {appraisalList.map((appraisal) => {
                    const stages = stagesForStatus(appraisal.status);
                    return (
                      <tr key={appraisal.id}>
                        <td className="font-medium">{appraisal.employeeName}<span className="block text-xs text-slate-400">{appraisal.staffNumber}</span></td>
                        <td>{appraisal.cycleName}</td>
                        <td><Badge tone={toneForStatus(appraisal.status)}>{appraisal.status.replace('_', ' ')}</Badge></td>
                        <td>
                          <ul className="space-y-1 text-xs text-slate-500">
                            {appraisal.objectives.map((objective) => (
                              <li key={objective.id}>{objective.title} · {objective.target} · {objective.weight}%</li>
                            ))}
                          </ul>
                        </td>
                        <td>{appraisal.selfRating ?? '—'}</td>
                        <td>{appraisal.finalRating ?? '—'}</td>
                        <td>{formatDateTime(appraisal.submittedAt)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {isOwnDraft(appraisal) ? (
                              <button className="text-brand-600 hover:underline" onClick={() => openSelfReview(appraisal)}>Self-review</button>
                            ) : null}
                            {canReview && stages.length > 0 ? (
                              <button className="text-brand-600 hover:underline" onClick={() => openReview(appraisal)}>Review</button>
                            ) : null}
                            {canFinalize && appraisal.status === 'HR_VALIDATION' ? (
                              <button className="text-brand-600 hover:underline" onClick={() => openFinalize(appraisal)}>Finalize</button>
                            ) : null}
                            {!isOwnDraft(appraisal) && (!canReview || stages.length === 0) && !(canFinalize && appraisal.status === 'HR_VALIDATION') ? (
                              <span className="text-slate-400">—</span>
                            ) : null}
                          </div>
                          {selfTargetId === appraisal.id ? (
                            <form onSubmit={(event) => submitSelfReviewForm(event, appraisal)} className="mt-2 w-96 space-y-2">
                              <Field label="Overall self rating"><RatingSelect value={selfRating} onChange={setSelfRating} /></Field>
                              <Field label="Self comment">
                                <textarea className={inputClass} rows={2} value={selfComment} onChange={(event) => setSelfComment(event.target.value)} minLength={3} required />
                              </Field>
                              <Field label="Development plan">
                                <textarea className={inputClass} rows={2} value={developmentPlan} onChange={(event) => setDevelopmentPlan(event.target.value)} />
                              </Field>
                              {appraisal.objectives.map((objective) => (
                                <Field key={objective.id} label={`${objective.title} rating`}>
                                  <RatingSelect
                                    value={objectiveRatings[objective.id] ?? ''}
                                    onChange={(value) => setObjectiveRatings((current) => ({ ...current, [objective.id]: value }))}
                                  />
                                </Field>
                              ))}
                              <div className="flex gap-2">
                                <Button type="submit" disabled={selfReview.isPending}>{selfReview.isPending ? 'Submitting…' : 'Submit self-review'}</Button>
                                <Button type="button" variant="secondary" onClick={() => setSelfTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                          {reviewTargetId === appraisal.id ? (
                            <form onSubmit={(event) => submitReviewForm(event, appraisal.id)} className="mt-2 w-80 space-y-2">
                              <Field label="Stage">
                                <select className={inputClass} value={reviewStage} onChange={(event) => setReviewStage(event.target.value as ReviewStage)}>
                                  {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                                </select>
                              </Field>
                              <Field label={`${reviewStage.charAt(0) + reviewStage.slice(1).toLowerCase()} rating`}><RatingSelect value={reviewRating} onChange={setReviewRating} /></Field>
                              <Field label="Comment">
                                <textarea className={inputClass} rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} minLength={3} required />
                              </Field>
                              <Field label="Development plan">
                                <textarea className={inputClass} rows={2} value={reviewDevelopmentPlan} onChange={(event) => setReviewDevelopmentPlan(event.target.value)} />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={reviewAppraisal.isPending}>{reviewAppraisal.isPending ? 'Submitting…' : 'Submit review'}</Button>
                                <Button type="button" variant="secondary" onClick={() => setReviewTargetId('')}>Close</Button>
                              </div>
                            </form>
                          ) : null}
                          {finalizeTargetId === appraisal.id ? (
                            <form onSubmit={(event) => submitFinalizeForm(event, appraisal.id)} className="mt-2 w-80 space-y-2">
                              <Field label="Final rating"><RatingSelect value={finalRating} onChange={setFinalRating} /></Field>
                              <Field label="Comment">
                                <textarea className={inputClass} rows={2} value={finalComment} onChange={(event) => setFinalComment(event.target.value)} minLength={3} required />
                              </Field>
                              <div className="flex gap-2">
                                <Button type="submit" disabled={finalizeAppraisal.isPending}>{finalizeAppraisal.isPending ? 'Finalizing…' : 'Finalize'}</Button>
                                <Button type="button" variant="secondary" onClick={() => setFinalizeTargetId('')}>Close</Button>
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
            <Pagination page={appraisalPage} pageSize={20} total={listTotal(appraisals.data)} onPage={setAppraisalPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
