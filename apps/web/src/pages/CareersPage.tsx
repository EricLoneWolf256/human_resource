import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applicationCreateSchema,
  applicationTrackSchema,
  offerResponseSchema,
  type ApplicationTrackingDto,
  type PublicVacancyDto,
} from '@umu-hr/shared';
import { api } from '../api';
import {
  Badge, Button, Card, Detail, EmptyState, ErrorBlock, Field, inputClass, Loading, PageHeader, toneForStatus,
} from '../components/ui';
import { formatDate, formatDateTime } from '../format';

interface ApplicationReceipt {
  reference: string;
  status: string;
  submittedAt: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function statusText(value: string): string {
  return value.replace(/_/g, ' ');
}

export default function CareersPage() {
  const queryClient = useQueryClient();
  const [vacancyId, setVacancyId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [submittedReference, setSubmittedReference] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [trackReference, setTrackReference] = useState('');
  const [trackEmail, setTrackEmail] = useState('');
  const [trackingError, setTrackingError] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [responseError, setResponseError] = useState('');

  const vacancies = useQuery({
    queryKey: ['careers', 'vacancies'],
    queryFn: () => api<PublicVacancyDto[]>('/careers/vacancies'),
  });

  const submitApplication = useMutation({
    mutationFn: (input: unknown) => api<ApplicationReceipt>('/careers/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: (receipt) => {
      setSubmittedReference(receipt.reference);
      setTrackReference(receipt.reference);
      setTrackEmail(email.trim());
      setVacancyId('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setCoverNote('');
      setQualifications('');
      setApplicationError('');
      void queryClient.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (caught: unknown) => setApplicationError(errorMessage(caught)),
  });

  const trackApplication = useMutation({
    mutationFn: (input: { reference: string; email: string }) =>
      api<ApplicationTrackingDto>(`/careers/applications/track?reference=${encodeURIComponent(input.reference)}&email=${encodeURIComponent(input.email)}`),
    onSuccess: () => setTrackingError(''),
    onError: (caught: unknown) => setTrackingError(errorMessage(caught)),
  });

  const respondToOffer = useMutation({
    mutationFn: (input: { action: 'ACCEPT' | 'DECLINE'; note: string }) =>
      api<ApplicationTrackingDto>(`/careers/applications/${encodeURIComponent(trackReference)}/response`, {
        method: 'POST',
        body: JSON.stringify({ ...input, email: trackEmail }),
      }),
    onSuccess: () => {
      setResponseError('');
      setOfferNote('');
      trackApplication.mutate({ reference: trackReference, email: trackEmail });
      void queryClient.invalidateQueries({ queryKey: ['careers'] });
    },
    onError: (caught: unknown) => setResponseError(errorMessage(caught)),
  });

  function submitApplicationForm(event: FormEvent): void {
    event.preventDefault();
    setApplicationError('');
    try {
      const input = applicationCreateSchema.parse({
        vacancyId,
        firstName,
        lastName,
        email,
        phone: phone.trim() || null,
        coverNote: coverNote.trim() || null,
        qualifications: qualifications.trim() || null,
      });
      submitApplication.mutate(input);
    } catch (caught) {
      setApplicationError(errorMessage(caught));
    }
  }

  function submitTrackingForm(event: FormEvent): void {
    event.preventDefault();
    setTrackingError('');
    trackApplication.reset();
    try {
      const input = applicationTrackSchema.parse({ reference: trackReference, email: trackEmail });
      trackApplication.mutate(input);
    } catch (caught) {
      setTrackingError(errorMessage(caught));
    }
  }

  function submitOfferResponse(event: FormEvent, action: 'ACCEPT' | 'DECLINE'): void {
    event.preventDefault();
    setResponseError('');
    try {
      const input = offerResponseSchema.parse({ action, note: offerNote.trim() || undefined });
      respondToOffer.mutate({ ...input, note: input.note ?? '' });
    } catch (caught) {
      setResponseError(errorMessage(caught));
    }
  }

  const vacancyItems = vacancies.data ?? [];

  return (
    <>
      <PageHeader title="Careers portal" subtitle="Browse open roles, apply online and track your application" />

      {vacancies.isLoading ? <Card className="mb-6"><Loading label="Loading vacancies…" /></Card> : null}
      {vacancies.isError ? <Card className="mb-6"><ErrorBlock message={errorMessage(vacancies.error)} /></Card> : null}
      {!vacancies.isLoading && !vacancies.isError && vacancyItems.length === 0 ? (
        <Card title="Open vacancies" className="mb-6"><EmptyState message="No open vacancies are available right now." /></Card>
      ) : null}
      {vacancyItems.length > 0 ? (
        <Card title="Open vacancies" className="mb-6">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Role</th><th>Unit</th><th>Type</th><th>Openings</th><th>Closing date</th><th>Details</th></tr>
              </thead>
              <tbody>
                {vacancyItems.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td className="font-medium">{vacancy.code}</td>
                    <td>{vacancy.title}{vacancy.positionTitle ? <span className="block text-xs text-slate-400">{vacancy.positionTitle}</span> : null}</td>
                    <td>{vacancy.unitName}</td>
                    <td>{statusText(vacancy.employmentType)}</td>
                    <td>{vacancy.openings}</td>
                    <td>{formatDate(vacancy.closingDate)}</td>
                    <td className="max-w-md space-y-1 text-xs text-slate-500">
                      {vacancy.description ? <p className="whitespace-pre-line">{vacancy.description}</p> : null}
                      {vacancy.requirements ? <p className="whitespace-pre-line">{vacancy.requirements}</p> : null}
                      {!vacancy.description && !vacancy.requirements ? <span>—</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Apply for a vacancy" className="mb-6">
        {applicationError ? <div className="mb-4"><ErrorBlock message={applicationError} /></div> : null}
        {submittedReference ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            Application submitted. Your reference is <strong>{submittedReference}</strong>.
          </div>
        ) : null}
        <form onSubmit={submitApplicationForm} className="grid gap-4 sm:grid-cols-2">
          <Field label="Vacancy">
            <select className={inputClass} value={vacancyId} onChange={(event) => setVacancyId(event.target.value)} required>
              <option value="">Select vacancy</option>
              {vacancyItems.map((vacancy) => <option key={vacancy.id} value={vacancy.id}>{vacancy.title}</option>)}
            </select>
          </Field>
          <Field label="First name"><input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={80} required /></Field>
          <Field label="Last name"><input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={80} required /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></Field>
          <Field label="Phone"><input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} /></Field>
          <div className="sm:col-span-2">
            <Field label="Qualifications"><textarea className={inputClass} rows={3} value={qualifications} onChange={(event) => setQualifications(event.target.value)} maxLength={5000} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Cover note"><textarea className={inputClass} rows={4} value={coverNote} onChange={(event) => setCoverNote(event.target.value)} maxLength={5000} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitApplication.isPending || vacancyItems.length === 0}>
              {submitApplication.isPending ? 'Submitting…' : 'Submit application'}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Track an application">
        <form onSubmit={submitTrackingForm} className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference">
            <input className={inputClass} value={trackReference} onChange={(event) => setTrackReference(event.target.value)} minLength={6} maxLength={30} required />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={trackEmail} onChange={(event) => setTrackEmail(event.target.value)} maxLength={254} required />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={trackApplication.isPending}>
              {trackApplication.isPending ? 'Checking…' : 'Track application'}
            </Button>
          </div>
        </form>
        {trackingError ? <div className="mt-4"><ErrorBlock message={trackingError} /></div> : null}
        {trackApplication.isPending ? <Loading label="Looking up your application…" /> : null}
        {!trackApplication.isPending && !trackApplication.data && !trackingError ? (
          <EmptyState message="Enter your reference and email to see your application status." />
        ) : null}
        {trackApplication.data ? (
          <div className="mt-4 rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-800">{trackApplication.data.reference}</span>
              <Badge tone={toneForStatus(trackApplication.data.status)}>{statusText(trackApplication.data.status)}</Badge>
            </div>
            <dl>
              <Detail label="Vacancy" value={trackApplication.data.vacancyTitle} />
              <Detail label="Status" value={statusText(trackApplication.data.status)} />
              <Detail label="Submitted" value={formatDateTime(trackApplication.data.submittedAt)} />
              <Detail label="Decision" value={formatDateTime(trackApplication.data.decisionAt)} />
              <Detail label="Offer details" value={trackApplication.data.offerDetails} />
            </dl>
            {trackApplication.data.status === 'OFFERED' ? (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="mb-3 text-sm font-medium text-slate-700">Respond to your offer</p>
                <form className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Field label="Note (optional)">
                      <textarea className={inputClass} rows={2} value={offerNote} onChange={(event) => setOfferNote(event.target.value)} maxLength={1000} />
                    </Field>
                  </div>
                  <Button type="button" onClick={(event) => submitOfferResponse(event, 'ACCEPT')} disabled={respondToOffer.isPending}>
                    {respondToOffer.isPending ? 'Sending…' : 'Accept offer'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={(event) => submitOfferResponse(event, 'DECLINE')} disabled={respondToOffer.isPending}>
                    Decline offer
                  </Button>
                </form>
                {responseError ? <div className="mt-3"><ErrorBlock message={responseError} /></div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}
