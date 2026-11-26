import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type EmployeeSkillDto, type Paginated, type TrainingCourseDto, type TrainingRecordDto, type TrainingRequestDto,
} from '@umu-hr/shared';
import { useAuth } from '../auth';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, Pagination, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';
import { listItems, listTotal, pageApi, pageErrorMessage } from './phase2Api';

type DecisionAction = 'RECOMMEND' | 'APPROVE' | 'REJECT';
type RequestStatusAction = 'REGISTERED' | 'CANCELLED';

interface CreateCourseInput {
  code: string;
  title: string;
  category: TrainingCourseDto['category'];
  provider: string;
  durationHours: number;
  isActive: boolean;
}

interface CreateRequestInput {
  courseId: string;
  reason: string;
  neededBy: string;
}

interface CompletionInput {
  id: string;
  completedAt: string;
  score: number | null;
  certificateNumber: string;
  skillName: string;
}

const COURSE_CATEGORIES: TrainingCourseDto['category'][] = ['TECHNICAL', 'PEDAGOGICAL', 'MANAGEMENT', 'COMPLIANCE', 'LANGUAGE', 'OTHER'];

function canCancelRequest(status: TrainingRequestDto['status']): boolean {
  return ['REQUESTED', 'RECOMMENDED', 'APPROVED', 'REGISTERED'].includes(status);
}

function canCompleteRequest(status: TrainingRequestDto['status']): boolean {
  return status === 'APPROVED' || status === 'REGISTERED';
}

export default function TrainingPage() {
  const { session, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [coursePage, setCoursePage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const [skillPage, setSkillPage] = useState(1);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCategory, setCourseCategory] = useState<TrainingCourseDto['category']>('TECHNICAL');
  const [provider, setProvider] = useState('');
  const [durationHours, setDurationHours] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [requestCourseId, setRequestCourseId] = useState('');
  const [reason, setReason] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [decisionTargetId, setDecisionTargetId] = useState('');
  const [decisionAction, setDecisionAction] = useState<DecisionAction>('RECOMMEND');
  const [decisionComment, setDecisionComment] = useState('');
  const [completionTargetId, setCompletionTargetId] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [score, setScore] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [skillName, setSkillName] = useState('');
  const [actionError, setActionError] = useState('');

  const canManage = hasPermission('training.manage');
  const canDecide = hasPermission('training.approve') || canManage;

  const courses = useQuery({
    queryKey: ['training', 'courses', coursePage],
    queryFn: () => pageApi<Paginated<TrainingCourseDto> | TrainingCourseDto[]>(`/training/courses?page=${coursePage}&pageSize=20`),
  });
  const requests = useQuery({
    queryKey: ['training', 'requests', requestPage],
    queryFn: () => pageApi<Paginated<TrainingRequestDto> | TrainingRequestDto[]>(`/training/requests?page=${requestPage}&pageSize=20`),
  });
  const records = useQuery({
    queryKey: ['training', 'records', recordPage],
    queryFn: () => pageApi<Paginated<TrainingRecordDto> | TrainingRecordDto[]>(`/training/records?page=${recordPage}&pageSize=20`),
  });
  const skills = useQuery({
    queryKey: ['training', 'skills', skillPage],
    queryFn: () => pageApi<Paginated<EmployeeSkillDto> | EmployeeSkillDto[]>(`/training/skills?page=${skillPage}&pageSize=20`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['training'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createCourse = useMutation({
    mutationFn: (input: CreateCourseInput) =>
      pageApi<TrainingCourseDto>('/training/courses', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      setShowCreateCourse(false);
      setCourseCode('');
      setCourseTitle('');
      setCourseCategory('TECHNICAL');
      setProvider('');
      setDurationHours('1');
      setIsActive(true);
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const createRequest = useMutation({
    mutationFn: (input: CreateRequestInput) =>
      pageApi<TrainingRequestDto>('/training/requests', {
        method: 'POST',
        body: JSON.stringify({
          courseId: input.courseId,
          reason: input.reason,
          neededBy: input.neededBy || undefined,
        }),
      }),
    onSuccess: () => {
      setShowCreateRequest(false);
      setRequestCourseId('');
      setReason('');
      setNeededBy('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const decideRequest = useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: DecisionAction; comment: string }) =>
      pageApi<TrainingRequestDto>(`/training/requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action, comment }),
      }),
    onSuccess: () => {
      setDecisionTargetId('');
      setDecisionComment('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const changeRequestStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequestStatusAction }) =>
      pageApi<TrainingRequestDto>(`/training/requests/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  const completeRequest = useMutation({
    mutationFn: (input: CompletionInput) =>
      pageApi<TrainingRequestDto>(`/training/requests/${input.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          completedAt: input.completedAt,
          score: input.score ?? undefined,
          certificateNumber: input.certificateNumber || undefined,
          skillName: input.skillName || undefined,
        }),
      }),
    onSuccess: () => {
      setCompletionTargetId('');
      setCompletedAt('');
      setScore('');
      setCertificateNumber('');
      setSkillName('');
      invalidate();
    },
    onError: (caught: unknown) => setActionError(pageErrorMessage(caught)),
  });

  function submitCreateCourse(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    const hours = Number(durationHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 1000) {
      setActionError('Duration must be a whole number between 1 and 1000 hours.');
      return;
    }
    createCourse.mutate({
      code: courseCode.trim(),
      title: courseTitle.trim(),
      category: courseCategory,
      provider: provider.trim(),
      durationHours: hours,
      isActive,
    });
  }

  function submitCreateRequest(event: FormEvent) {
    event.preventDefault();
    setActionError('');
    if (!session?.employeeId) {
      setActionError('Your account is not linked to an employee record.');
      return;
    }
    if (reason.trim().length < 3) {
      setActionError('Provide a reason of at least 3 characters.');
      return;
    }
    createRequest.mutate({ courseId: requestCourseId, reason: reason.trim(), neededBy });
  }

  function openDecision(id: string, action: DecisionAction) {
    setActionError('');
    setCompletionTargetId('');
    setDecisionTargetId(id);
    setDecisionAction(action);
    setDecisionComment('');
  }

  function submitDecision(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    if (decisionComment.trim().length < 3) {
      setActionError('Provide a comment of at least 3 characters.');
      return;
    }
    decideRequest.mutate({ id, action: decisionAction, comment: decisionComment.trim() });
  }

  function openCompletion(id: string) {
    setActionError('');
    setDecisionTargetId('');
    setCompletionTargetId(id);
    setCompletedAt('');
    setScore('');
    setCertificateNumber('');
    setSkillName('');
  }

  function submitCompletion(event: FormEvent, id: string) {
    event.preventDefault();
    setActionError('');
    const scoreText = score.trim();
    const numericScore = scoreText ? Number(scoreText) : null;
    const certificate = certificateNumber.trim();
    const skill = skillName.trim();
    if (numericScore !== null && (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100)) {
      setActionError('Score must be a whole number between 0 and 100.');
      return;
    }
    if (certificate && certificate.length < 3) {
      setActionError('Certificate number must be at least 3 characters.');
      return;
    }
    if (skill && skill.length < 2) {
      setActionError('Skill name must be at least 2 characters.');
      return;
    }
    completeRequest.mutate({
      id,
      completedAt,
      score: numericScore,
      certificateNumber: certificate,
      skillName: skill,
    });
  }

  const courseList = listItems(courses.data);
  const requestList = listItems(requests.data);
  const recordList = listItems(records.data);
  const skillList = listItems(skills.data);
  const activeCourses = courseList.filter((course) => course.isActive);

  return (
    <>
      <PageHeader
        title="Training"
        subtitle="Courses, requests, completions and employee skills"
        actions={
          <>
            {canManage ? (
              <Button variant="secondary" onClick={() => setShowCreateCourse((value) => !value)}>New course</Button>
            ) : null}
            {session?.employeeId ? (
              <Button variant="secondary" onClick={() => setShowCreateRequest((value) => !value)}>New training request</Button>
            ) : null}
          </>
        }
      />
      {actionError ? <ErrorBlock message={actionError} /> : null}

      {showCreateCourse && canManage ? (
        <Card title="Create training course" className="mb-6">
          <form onSubmit={submitCreateCourse} className="grid gap-4 sm:grid-cols-6">
            <Field label="Code">
              <input
                className={inputClass}
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value)}
                pattern="[A-Z0-9-]{2,20}"
                required
              />
            </Field>
            <Field label="Title"><input className={inputClass} value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} minLength={2} required /></Field>
            <Field label="Category">
              <select className={inputClass} value={courseCategory} onChange={(event) => setCourseCategory(event.target.value as TrainingCourseDto['category'])}>
                {COURSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Provider"><input className={inputClass} value={provider} onChange={(event) => setProvider(event.target.value)} /></Field>
            <Field label="Duration (hours)">
              <input className={inputClass} type="number" min={1} max={1000} value={durationHours} onChange={(event) => setDurationHours(event.target.value)} required />
            </Field>
            <Field label="Active">
              <input className="h-4 w-4" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            </Field>
            <div className="sm:col-span-6">
              <Button type="submit" disabled={createCourse.isPending}>{createCourse.isPending ? 'Creating…' : 'Create course'}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {showCreateRequest && session?.employeeId ? (
        <Card title="New training request" className="mb-6">
          <form onSubmit={submitCreateRequest} className="grid gap-4 sm:grid-cols-3">
            <Field label="Course">
              <select className={inputClass} value={requestCourseId} onChange={(event) => setRequestCourseId(event.target.value)} required>
                <option value="">Select course</option>
                {activeCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
              </select>
            </Field>
            <Field label="Reason"><textarea className={inputClass} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></Field>
            <Field label="Needed by"><input className={inputClass} type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} /></Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={createRequest.isPending}>{createRequest.isPending ? 'Submitting…' : 'Submit request'}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Training courses" className="mb-6">
        {courses.isLoading ? <Loading /> : null}
        {courses.isError ? <ErrorBlock message={pageErrorMessage(courses.error)} /> : null}
        {!courses.isLoading && !courses.isError && courseList.length === 0 ? <EmptyState message="No training courses found" /> : null}
        {courseList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Title</th><th>Category</th><th>Provider</th><th>Duration</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {courseList.map((course) => (
                    <tr key={course.id}>
                      <td className="font-medium">{course.code}</td>
                      <td>{course.title}</td>
                      <td>{course.category.charAt(0) + course.category.slice(1).toLowerCase()}</td>
                      <td>{course.provider ?? '—'}</td>
                      <td>{course.durationHours} h</td>
                      <td><Badge tone={course.isActive ? 'green' : 'red'}>{course.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={coursePage} pageSize={20} total={listTotal(courses.data)} onPage={setCoursePage} />
          </>
        ) : null}
      </Card>

      <Card title="Training requests" className="mb-6">
        {requests.isLoading ? <Loading /> : null}
        {requests.isError ? <ErrorBlock message={pageErrorMessage(requests.error)} /> : null}
        {!requests.isLoading && !requests.isError && requestList.length === 0 ? <EmptyState message="No training requests found" /> : null}
        {requestList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Reference</th><th>Employee</th><th>Course</th><th>Reason</th><th>Needed by</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {requestList.map((request) => (
                    <tr key={request.id}>
                      <td className="font-medium">{request.reference}</td>
                      <td>{request.employeeName}</td>
                      <td>{request.courseTitle}</td>
                      <td>{request.reason}</td>
                      <td>{formatDate(request.neededBy)}</td>
                      <td><Badge tone={toneForStatus(request.status)}>{request.status}</Badge></td>
                      <td>{formatDateTime(request.createdAt)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {hasPermission('training.approve') && request.status === 'REQUESTED' ? (
                            <button className="text-brand-600 hover:underline" onClick={() => openDecision(request.id, 'RECOMMEND')}>Recommend</button>
                          ) : null}
                          {canDecide && ['REQUESTED', 'RECOMMENDED'].includes(request.status) ? (
                            <>
                              <button className="text-brand-600 hover:underline" onClick={() => openDecision(request.id, 'APPROVE')}>Approve</button>
                              <button className="text-rose-600 hover:underline" onClick={() => openDecision(request.id, 'REJECT')}>Reject</button>
                            </>
                          ) : null}
                          {canManage && request.status === 'APPROVED' ? (
                            <button
                              className="text-brand-600 hover:underline"
                              disabled={changeRequestStatus.isPending}
                              onClick={() => { setActionError(''); changeRequestStatus.mutate({ id: request.id, status: 'REGISTERED' }); }}
                            >
                              Register
                            </button>
                          ) : null}
                          {canManage && canCancelRequest(request.status) ? (
                            <button
                              className="text-rose-600 hover:underline"
                              disabled={changeRequestStatus.isPending}
                              onClick={() => { setActionError(''); changeRequestStatus.mutate({ id: request.id, status: 'CANCELLED' }); }}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {canManage && canCompleteRequest(request.status) ? (
                            <button className="text-brand-600 hover:underline" onClick={() => openCompletion(request.id)}>Complete</button>
                          ) : null}
                          {!canDecide && !canManage ? <span className="text-slate-400">—</span> : null}
                        </div>
                        {decisionTargetId === request.id ? (
                          <form onSubmit={(event) => submitDecision(event, request.id)} className="mt-2 w-80 space-y-2">
                            <Field label="Decision">
                              <select
                                className={inputClass}
                                value={decisionAction}
                                onChange={(event) => setDecisionAction(event.target.value as DecisionAction)}
                              >
                                {request.status === 'REQUESTED' && hasPermission('training.approve') ? <option value="RECOMMEND">Recommend</option> : null}
                                <option value="APPROVE">Approve</option>
                                <option value="REJECT">Reject</option>
                              </select>
                            </Field>
                            <Field label="Comment">
                              <textarea className={inputClass} rows={2} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} minLength={3} required />
                            </Field>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={decideRequest.isPending}>{decideRequest.isPending ? 'Submitting…' : 'Submit decision'}</Button>
                              <Button type="button" variant="secondary" onClick={() => setDecisionTargetId('')}>Close</Button>
                            </div>
                          </form>
                        ) : null}
                        {completionTargetId === request.id ? (
                          <form onSubmit={(event) => submitCompletion(event, request.id)} className="mt-2 w-80 space-y-2">
                            <Field label="Completed at"><input className={inputClass} type="date" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} required /></Field>
                            <Field label="Score"><input className={inputClass} type="number" min={0} max={100} value={score} onChange={(event) => setScore(event.target.value)} /></Field>
                            <Field label="Certificate number"><input className={inputClass} value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} minLength={3} /></Field>
                            <Field label="Skill name"><input className={inputClass} value={skillName} onChange={(event) => setSkillName(event.target.value)} minLength={2} /></Field>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={completeRequest.isPending}>{completeRequest.isPending ? 'Recording…' : 'Record completion'}</Button>
                              <Button type="button" variant="secondary" onClick={() => setCompletionTargetId('')}>Close</Button>
                            </div>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={requestPage} pageSize={20} total={listTotal(requests.data)} onPage={setRequestPage} />
          </>
        ) : null}
      </Card>

      <Card title="Training records" className="mb-6">
        {records.isLoading ? <Loading /> : null}
        {records.isError ? <ErrorBlock message={pageErrorMessage(records.error)} /> : null}
        {!records.isLoading && !records.isError && recordList.length === 0 ? <EmptyState message="No training records found" /> : null}
        {recordList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Course</th><th>Completed</th><th>Score</th><th>Certificate</th><th>Expiry</th></tr>
                </thead>
                <tbody>
                  {recordList.map((record) => (
                    <tr key={record.id}>
                      <td className="font-medium">{record.employeeName}</td>
                      <td>{record.courseTitle}</td>
                      <td>{formatDate(record.completedAt)}</td>
                      <td>{record.score ?? '—'}</td>
                      <td>{record.certificateNumber ?? '—'}</td>
                      <td>{formatDate(record.expiryDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={recordPage} pageSize={20} total={listTotal(records.data)} onPage={setRecordPage} />
          </>
        ) : null}
      </Card>

      <Card title="Employee skills">
        {skills.isLoading ? <Loading /> : null}
        {skills.isError ? <ErrorBlock message={pageErrorMessage(skills.error)} /> : null}
        {!skills.isLoading && !skills.isError && skillList.length === 0 ? <EmptyState message="No employee skills found" /> : null}
        {skillList.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Employee ID</th><th>Skill</th><th>Certificate</th><th>Issued</th><th>Expiry</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {skillList.map((skill) => (
                    <tr key={skill.id}>
                      <td className="font-medium">{skill.employeeId}</td>
                      <td>{skill.name}</td>
                      <td>{skill.certificateNumber ?? '—'}</td>
                      <td>{formatDate(skill.issuedAt)}</td>
                      <td>{formatDate(skill.expiryDate)}</td>
                      <td><Badge tone={skill.isExpired ? 'red' : 'green'}>{skill.isExpired ? 'Expired' : 'Valid'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={skillPage} pageSize={20} total={listTotal(skills.data)} onPage={setSkillPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}
