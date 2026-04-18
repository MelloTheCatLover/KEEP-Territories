import { Link } from 'react-router-dom';
import { AlertCircle, Map, ClipboardList, BookOpen, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../shared/ui';

export function AdminHubPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
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
    <div className="max-w-4xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Админ-панель</h1>
      <p className="text-sm text-neutral-700 mb-6">Управление игрой.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/admin/map" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Map className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Карта</h2>
                <p className="text-sm text-neutral-700">Генерация и удаление секторов.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/tasks" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <BookOpen className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Задания</h2>
                <p className="text-sm text-neutral-700">Редактирование пула заданий.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/submissions" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <ClipboardList className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Очередь проверки</h2>
                <p className="text-sm text-neutral-700">Модерация заявок команд.</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/settings" className="block">
          <Card className="hover:border-brand-500 transition-colors">
            <div className="flex items-start gap-3">
              <Settings className="w-6 h-6 text-brand-400 mt-0.5" />
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Настройки</h2>
                <p className="text-sm text-neutral-700">Глобальные параметры игры.</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
