import { AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../shared/ui';

export function AdminSubmissionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-8 px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Админ — очередь проверки</h1>
      <p className="text-sm text-neutral-700 mb-6">Заглушка. Функциональность добавится позже.</p>
    </div>
  );
}
