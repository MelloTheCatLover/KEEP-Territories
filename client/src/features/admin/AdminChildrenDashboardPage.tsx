import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card, ErrorBanner, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getDashboard, deleteChild, type ChildDashboardRow } from './children-lists-api';

export function AdminChildrenDashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState<ChildDashboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(row: ChildDashboardRow) {
    const warn = row.has_account
      ? `Удалить ${row.full_name}? Аккаунт ${row.login ?? ''} и все его данные будут удалены безвозвратно.`
      : `Удалить ${row.full_name} из базы? Действие необратимо.`;
    if (!confirm(warn)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteChild(row.id);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    getDashboard()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось загрузить'));
  }, [isAdmin]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [rows, query]);

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
    <div className="max-w-5xl mx-auto px-4 space-y-5">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Все дети</h1>
        <p className="text-sm text-neutral-700">
          Общая база: коды, аккаунты и смены, в которых ребёнок участвовал.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="max-w-sm">
        <Label htmlFor="q">Поиск по ФИО или коду</Label>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-700 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="q"
            className="w-full bg-neutral-200 border border-neutral-400 rounded-sm pl-9 pr-3 py-2 text-sm text-neutral-1000"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Иванов / CH0001"
          />
        </div>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-700 border-b border-neutral-300">
                  <th className="py-2 pr-3 font-medium">Код</th>
                  <th className="py-2 pr-3 font-medium">ФИО</th>
                  <th className="py-2 pr-3 font-medium">Аккаунт</th>
                  <th className="py-2 pr-3 font-medium">Списки</th>
                  <th className="py-2 pr-3 font-medium">Смены</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-200 last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-neutral-700">{r.code}</td>
                    <td className="py-2 pr-3 text-neutral-1000">{r.full_name}</td>
                    <td className="py-2 pr-3 font-mono text-neutral-900">{r.login ?? '—'}</td>
                    <td className="py-2 pr-3 text-neutral-700">
                      {r.lists.length > 0 ? r.lists.join(', ') : '—'}
                    </td>
                    <td className="py-2 pr-3 text-neutral-700">
                      {r.seasons.length > 0 ? r.seasons.join(', ') : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="text-error hover:opacity-80 p-1 disabled:opacity-40"
                        onClick={() => void handleDelete(r)}
                        disabled={deletingId === r.id}
                        title="Удалить ребёнка из базы"
                      >
                        {deletingId === r.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-neutral-700">Ничего не найдено.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-neutral-700 mt-3">Всего детей: {rows.length}</div>
        </Card>
      )}
    </div>
  );
}
