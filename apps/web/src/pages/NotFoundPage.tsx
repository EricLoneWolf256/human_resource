import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="The page you requested does not exist." />
      <Link className="text-brand-600 hover:underline" to="/">Return to dashboard</Link>
    </>
  );
}
