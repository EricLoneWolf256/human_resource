import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@umu-hr/shared';
import { useAuth } from '../auth';
import { ErrorBlock, Field, inputClass } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    try {
      const input = loginSchema.parse(values);
      await login(input);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    }
  });

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
