import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHANGE_REQUEST_FIELDS, changeRequestCreateSchema, selfServiceSchema, type EmployeeDetail } from '@umu-hr/shared';
import { api } from '../api';
import { Badge, Button, Card, Detail, ErrorBlock, Field, inputClass, Loading, PageHeader } from '../components/ui';
import { formatDate } from '../format';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [field, setField] = useState<string>(CHANGE_REQUEST_FIELDS[0]);
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const profile = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api<EmployeeDetail>('/employees/me'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['my-profile'] });

  const selfService = useMutation({
    mutationFn: (input: unknown) => api<EmployeeDetail>('/employees/me/self-service', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => { setMessage('Profile details updated.'); invalidate(); },
    onError: (caught: Error) => setError(caught.message),
  });

  const changeRequest = useMutation({
    mutationFn: (input: unknown) => api('/employees/me/change-requests', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => { setMessage('Correction request submitted.'); setRequestedValue(''); setReason(''); },
    onError: (caught: Error) => setError(caught.message),
  });

  if (profile.isLoading) return <Loading />;
  if (profile.isError) return <ErrorBlock message={profile.error.message} />;
  const data = profile.data;
  if (!data) return <ErrorBlock message="No employee profile is linked to your account" />;

  function submitSelfService(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const input = selfServiceSchema.parse({
        phone: phone || null,
        preferredName: preferredName || null,
        ...(contactName && contactRelationship && contactPhone
          ? { emergencyContacts: [{ name: contactName, relationship: contactRelationship, phone: contactPhone }] }
          : {}),
      });
      selfService.mutate(input);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  function submitRequest(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      changeRequest.mutate(changeRequestCreateSchema.parse({ field, requestedValue, reason: reason || undefined }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid input');
    }
  }

  return (
    <>
      <PageHeader title="My profile" subtitle={`${data.staffNumber} · ${data.fullName}`} actions={<Badge tone={data.profileStatus === 'VERIFIED' ? 'green' : 'amber'}>{data.profileStatus}</Badge>} />
      {error ? <ErrorBlock message={error} /> : null}
      {message ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Employee record">
          <dl>
            <Detail label="Email" value={data.contactEmail} />
            <Detail label="Phone" value={data.phone} />
            <Detail label="Hire date" value={formatDate(data.hireDate)} />
            <Detail label="Primary unit" value={data.primaryUnit?.name} />
            <Detail label="Completeness" value={`${data.completeness.percent}%`} />
            <Detail label="National ID" value={data.nationalId} />
            <Detail label="Date of birth" value={formatDate(data.dateOfBirth)} />
          </dl>
          {data.emergencyContacts.length > 0 ? (
            <p className="mt-3 text-sm text-slate-600">Emergency contact: {data.emergencyContacts[0]?.name} ({data.emergencyContacts[0]?.relationship})</p>
          ) : null}
        </Card>

        <Card title="Update my details">
          <form onSubmit={submitSelfService} className="space-y-4">
            <Field label="Preferred name"><input className={inputClass} defaultValue={data.preferredName ?? ''} onChange={(e) => setPreferredName(e.target.value)} /></Field>
            <Field label="Phone"><input className={inputClass} defaultValue={data.phone ?? ''} onChange={(e) => setPhone(e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Emergency contact"><input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
              <Field label="Relationship"><input className={inputClass} value={contactRelationship} onChange={(e) => setContactRelationship(e.target.value)} /></Field>
              <Field label="Contact phone"><input className={inputClass} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
            </div>
            <Button type="submit" disabled={selfService.isPending}>Save changes</Button>
          </form>
        </Card>

        <Card title="Request a correction">
          <form onSubmit={submitRequest} className="space-y-4">
            <Field label="Field to correct">
              <select className={inputClass} value={field} onChange={(e) => setField(e.target.value)}>
                {CHANGE_REQUEST_FIELDS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Correct value"><input className={inputClass} value={requestedValue} onChange={(e) => setRequestedValue(e.target.value)} required /></Field>
            <Field label="Reason"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Button type="submit" disabled={changeRequest.isPending}>Submit request</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
