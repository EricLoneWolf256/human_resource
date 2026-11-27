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
import LeavePage from './pages/LeavePage';
import RequestsPage from './pages/RequestsPage';
import ContractsPage from './pages/ContractsPage';
import OnboardingPage from './pages/OnboardingPage';
import DelegationsPage from './pages/DelegationsPage';
import RecruitmentPage from './pages/RecruitmentPage';
import CareersPage from './pages/CareersPage';
import PerformancePage from './pages/PerformancePage';
import TrainingPage from './pages/TrainingPage';
import CareerPage from './pages/CareerPage';
import ReportsPage from './pages/ReportsPage';
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
      <Route path="/careers" element={<CareersPage />} />
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
        <Route path="leave" element={<LeavePage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="delegations" element={<DelegationsPage />} />
        <Route path="recruitment" element={<RecruitmentPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="career" element={<CareerPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
