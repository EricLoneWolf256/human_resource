import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@umu-hr/shared';
import { useAuth } from '../auth';
import { ErrorBlock, Field, inputClass } from '../components/ui';

export default function LoginPage() {
  const { login, verifyMfa, recoverMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    defaultValues: { email: '', password: '' },
  });

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    try {
      const input = loginSchema.parse(values);
      const result = await login(input);
      if (result.mfaRequired) setChallengeToken(result.challengeToken);
      else navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    }
  });

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError('');
    try {
      await verifyMfa({ challengeToken, code });
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to verify code');
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent) {
    event.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError('');
    try {
      await recoverMfa({ challengeToken, recoveryCode });
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to verify recovery code');
    } finally {
      setBusy(false);
    }
  }

  if (challengeToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">University of Malawi</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Two-factor verification</h1>
            <p className="mt-1 text-sm text-slate-500">Enter a code from your authenticator app.</p>
          </div>
          {error ? <ErrorBlock message={error} /> : null}
          <form onSubmit={submitCode} className="space-y-4">
            <Field label="Authenticator code">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300"
            >
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
          <form onSubmit={submitRecovery} className="space-y-4 border-t border-slate-200 pt-4">
            <Field label="Recovery code" hint="Use this if you cannot access your authenticator app.">
              <input
                className={inputClass}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                autoComplete="off"
                required
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              Use recovery code
            </button>
          </form>
          <button type="button" className="text-sm text-brand-700 underline" onClick={() => setChallengeToken(null)}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">University of Malawi</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">HR &amp; Staff Management</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with your HR account.</p>
        </div>
        {error ? <ErrorBlock message={error} /> : null}
        <Field label="Email address">
          <input {...register('email')} className={inputClass} type="email" autoComplete="username" placeholder="name@umu.ac.mw" />
          {errors.email ? <span className="mt-1 block text-xs text-rose-600">{errors.email.message}</span> : null}
        </Field>
        <Field label="Password">
          <input {...register('password')} className={inputClass} type="password" autoComplete="current-password" />
          {errors.password ? <span className="mt-1 block text-xs text-rose-600">{errors.password.message}</span> : null}
        </Field>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
