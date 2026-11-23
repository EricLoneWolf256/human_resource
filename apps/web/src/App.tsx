import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import ProfilePage from './pages/ProfilePage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import OrganizationPage from './pages/OrganizationPage';
import DocumentsPage from './pages/DocumentsPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditPage from './pages/AuditPage';
import AccessPage from './pages/AccessPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth() {
  const { session, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loading label="Checking your session…" />;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Layout />;
}

function GuestOnly() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <Loading label="Checking your session…" />;
  return session ? <Navigate to="/" replace /> : <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="organization" element={<OrganizationPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="access" element={<AccessPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
