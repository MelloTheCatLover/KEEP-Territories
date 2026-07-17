import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../shared/ui';

/** The one access-denied screen, shared by every admin page. */
export function AccessDenied() {
  return (
    <div className="max-w-2xl mx-auto px-4">
      <Card>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">
              Доступ запрещён
            </h1>
            <p className="text-sm text-neutral-700">
              Эта страница доступна только администраторам.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Single role gate for every admin page — replaces the per-page copy-paste. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <AccessDenied />;
  return <>{children}</>;
}

type HeaderProps = {
  title: string;
  /** Right-aligned controls (refresh, create, …). */
  actions?: ReactNode;
};

/**
 * Compact page header: a quiet way back to the hub plus the title.
 * No subtitles — admin pages explain themselves by their content.
 */
export function AdminPageHeader({ title, actions }: HeaderProps) {
  return (
    <div className="mb-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-xs text-neutral-700 hover:text-neutral-1000 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Админ
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-0.5">
        <h1 className="font-display text-heading-sm sm:text-heading-md text-neutral-1000">
          {title}
        </h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
