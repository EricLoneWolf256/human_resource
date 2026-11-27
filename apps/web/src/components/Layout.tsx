import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, ErrorBlock, Field, inputClass } from './ui';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
  anyPermission?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/profile', label: 'My profile' },
  { to: '/employees', label: 'Employees', permission: 'employee.view' },
  { to: '/organization', label: 'Organization', permission: 'org.view' },
  { to: '/documents', label: 'Documents', permission: 'document.view' },
  { to: '/leave', label: 'Leave', permission: 'leave.view' },
  { to: '/requests', label: 'HR requests', permission: 'request.view' },
  { to: '/contracts', label: 'Contracts', permission: 'contract.view' },
  { to: '/onboarding', label: 'Onboarding', permission: 'onboarding.view' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/audit', label: 'Audit trail', permission: 'audit.view' },
  { to: '/access', label: 'Access control', permission: 'user.manage' },
  { to: '/delegations', label: 'Delegations', anyPermission: ['role.manage', 'access.delegate'] },
  { to: '/recruitment', label: 'Recruitment', anyPermission: ['recruitment.view', 'candidate.view'] },
  { to: '/performance', label: 'Performance', permission: 'appraisal.view' },
  { to: '/training', label: 'Training', permission: 'training.view' },
  { to: '/career', label: 'Career & promotion', permission: 'career.view' },
  { to: '/reports', label: 'Reports & analytics', permission: 'report.view' },
  { to: '/careers', label: 'Careers portal' },
];

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const { changingPassword, setChangingPassword } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setChangingPassword(false);
      onClose();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    mutation.mutate();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      if (!changingPassword) onClose();
      return;
    }
    if (event.key !== 'Tab' || !formRef.current) return;
    const focusable = [...formRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')];
    if (focusable.length === 0) return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        ref={formRef}
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div>
          <h2 id="change-password-title" className="text-lg font-semibold">Change password</h2>
          <p className="mt-1 text-sm text-slate-500">You must set a new password before continuing.</p>
        </div>
        {error ? <ErrorBlock message={error} /> : null}
        <Field label="Current password">
          <input className={inputClass} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 10 characters, including a letter and a digit.">
          <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          {changingPassword ? null : <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>}
          <Button type="submit" disabled={mutation.isPending || !currentPassword || !newPassword}>Save new password</Button>
        </div>
      </form>
    </div>
  );
}

export default function Layout() {
  const { session, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
  });

  const rolesAvailable = Boolean(session && session.permissions.length > 0);
  const items = NAV_ITEMS.filter((item) => {
    if (item.anyPermission) {
      return !rolesAvailable || item.anyPermission.some((permission) => hasPermission(permission));
    }
    return !item.permission || hasPermission(item.permission);
  });
  const unreadCount = unread.data?.count ?? 0;

  return (
    <>
      <a href="#main-content" className="sr-only rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]">
        Skip to content
      </a>
      <div className="min-h-screen lg:flex">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="primary-navigation"
          onClick={() => setNavOpen((open) => !open)}
          className="m-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
        >
          {navOpen ? 'Close menu' : 'Open menu'}
        </button>
        <aside id="primary-navigation" className={`${navOpen ? 'block' : 'hidden'} bg-slate-900 text-slate-200 lg:block lg:w-64 lg:shrink-0`}>
          <div className="px-5 py-5 text-lg font-semibold text-white">UMU HR</div>
          <nav aria-label="Primary navigation" className="flex flex-col gap-1 px-3 pb-5">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.to === '/notifications' && unreadCount > 0 ? (
                  <span aria-label={`${unreadCount} unread notifications`}>
                    <Badge tone="red">{unreadCount}</Badge>
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {session?.employee
                  ? `${session.employee.firstName} ${session.employee.lastName}`.trim()
                  : session?.email}
              </p>
              <p className="text-xs text-slate-500">
                {session?.roleAssignments.filter((role) => role.effective).map((role) => role.roleName).join(' · ') || 'No active roles'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowPassword(true)}>Change password</Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                Sign out
              </Button>
            </div>
          </header>

          {session?.mustChangePassword ? (
            <div className="m-4 mb-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:m-6 sm:mb-0">
              Your account requires a password change.{' '}
              <button type="button" className="font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={() => setShowPassword(true)}>
                Update now
              </button>
            </div>
          ) : null}

          <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl p-4 focus:outline-none sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {showPassword ? <ChangePasswordDialog onClose={() => setShowPassword(false)} /> : null}
    </>
  );
}
