import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title ? <h2 className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-800">{title}</h2> : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

type BadgeTone = 'slate' | 'green' | 'amber' | 'red' | 'blue';

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function toneForStatus(status: string): BadgeTone {
  if (['ACTIVE', 'VERIFIED', 'APPROVED', 'READY'].includes(status)) return 'green';
  if (['PENDING', 'DRAFT', 'INCOMPLETE', 'SUBMITTED', 'SUSPENDED'].includes(status)) return 'amber';
  if (['DEACTIVATED', 'REJECTED', 'ARCHIVED', 'TERMINATED', 'INACTIVE'].includes(status)) return 'red';
  if (['HIGH'].includes(status)) return 'blue';
  return 'slate';
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  };
  return (
    <button
      {...props}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="rounded text-brand-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" to={to}>{children}</Link>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-slate-500" role="status" aria-live="polite">{label}</div>;
}

export function ErrorBlock({ message }: { message: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{message}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-500" role="status">{message}</div>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <span>
        Page {page} of {pages} · {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

export function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>
  );
}
