import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  { to: '/careers', label: 'Careers portal' },
];

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const { setChangingPassword } = useAuth();

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

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="mt-1 text-sm text-slate-500">You must set a new password before continuing.</p>
        </div>
        {error ? <ErrorBlock message={error} /> : null}
        <Field label="Current password">
          <input className={inputClass} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 10 characters, including a letter and a digit.">
          <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} />
        </Field>
        <Button type="submit" disabled={mutation.isPending || !currentPassword || !newPassword}>Save new password</Button>
      </form>
    </div>
  );
}

export default function Layout() {
  const { session, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-slate-900 text-slate-200 lg:w-64 lg:shrink-0">
        <div className="px-5 py-5 text-lg font-semibold text-white">UMU HR</div>
        <nav className="flex flex-wrap gap-1 px-3 pb-5 lg:flex-col">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span>{item.label}</span>
              {item.to === '/notifications' && (unread.data?.count ?? 0) > 0 ? (
                <Badge tone="red">{unread.data?.count}</Badge>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
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
          <div className="m-6 mb-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your account requires a password change. <Link className="font-semibold underline" to="#" onClick={() => setShowPassword(true)}>Update now</Link>
          </div>
        ) : null}

        <main className="mx-auto max-w-7xl p-6">
          <Outlet />
        </main>
      </div>

      {showPassword ? <ChangePasswordDialog onClose={() => setShowPassword(false)} /> : null}
    </div>
  );
}
