import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MfaEnabledDto, MfaSetupDto } from '@umu-hr/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, ErrorBlock, Field, inputClass } from './ui';

type Step = 'intro' | 'setup' | 'recovery' | 'disable';

export default function MfaDialog({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(session?.mfaEnabled ? 'disable' : 'intro');
  const [setup, setSetup] = useState<MfaSetupDto | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const setupMutation = useMutation({
    mutationFn: () => api<MfaSetupDto>('/auth/mfa/setup', { method: 'POST' }),
    onSuccess: (result) => {
      setSetup(result);
      setStep('setup');
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const enableMutation = useMutation({
    mutationFn: () => api<MfaEnabledDto>('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: (result) => {
      setRecoveryCodes(result.recoveryCodes);
      setCode('');
      setStep('recovery');
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      onClose();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement | HTMLButtonElement>('input, button')?.focus();
  }, [step]);

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !formRef.current) return;
    const focusable = [...formRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (step === 'disable') disableMutation.mutate();
    else if (step === 'setup') enableMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        ref={formRef}
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-title"
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div>
          <h2 id="mfa-title" className="text-lg font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-slate-500">
            {session?.mfaEnabled
              ? 'Disabling MFA weakens account security and may be restricted in production.'
              : 'Protect your account with an authenticator app and recovery codes.'}
          </p>
        </div>
        {error ? <ErrorBlock message={error} /> : null}

        {step === 'intro' ? (
          <Button type="button" onClick={() => { setError(''); setupMutation.mutate(); }} disabled={setupMutation.isPending}>
            {setupMutation.isPending ? 'Preparing…' : 'Start enrolment'}
          </Button>
        ) : null}

        {step === 'setup' && setup ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700">1. Add this secret to your authenticator app</p>
              <code className="mt-2 block break-all rounded-lg bg-slate-100 p-3 text-sm">{setup.secret}</code>
              <p className="mt-2 text-xs text-slate-500">Manual setup URL: {setup.otpauthUrl}</p>
            </div>
            <Field label="2. Enter the 6-digit code" hint="Codes rotate every 30 seconds.">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </Field>
            <Button type="submit" disabled={enableMutation.isPending || code.length !== 6}>
              {enableMutation.isPending ? 'Enabling…' : 'Enable MFA'}
            </Button>
          </div>
        ) : null}

        {step === 'recovery' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">MFA is enabled. Save these recovery codes now; they are shown only once.</p>
            <code className="block whitespace-pre-line rounded-lg bg-slate-100 p-3 text-sm">{recoveryCodes.join('\n')}</code>
            <Button type="button" onClick={onClose}>I have saved my codes</Button>
          </div>
        ) : null}

        {step === 'disable' ? (
          <div className="space-y-4">
            <Field label="Authenticator code">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </Field>
            <Button type="submit" variant="danger" disabled={disableMutation.isPending || code.length !== 6}>
              {disableMutation.isPending ? 'Disabling…' : 'Disable MFA'}
            </Button>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </form>
    </div>
  );
}
