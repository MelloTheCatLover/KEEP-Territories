import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { api, ApiError } from '../../shared/api/client';
import { getAuditLog, type AuditLogEntry } from './audit-api';

const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  map: 'Карта',
  sector: 'Сектор',
  submission: 'Заявка',
  team: 'Команда',
  season: 'Сезон',
  task: 'Задание',
};

const ENTITY_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Все типы' },
  { value: 'sector', label: 'Сектора (карта)' },
  { value: 'submission', label: 'Заявки' },
  { value: 'team', label: 'Команды' },
  { value: 'map', label: 'Генерация карты' },
  { value: 'season', label: 'Сезоны' },
  { value: 'task', label: 'Задания' },
];

const ENTITY_TINT: Record<string, string> = {
  map: 'bg-brand-100 text-brand-700',
  sector: 'bg-success-bg text-success-text',
  submission: 'bg-warning-bg text-warning-text',
  team: 'bg-info-bg text-info-text',
  season: 'bg-neutral-200 text-neutral-800',
  task: 'bg-neutral-200 text-neutral-800',
};

interface TeamOption {
  id: string;
  name: string;
}

function actorName(e: AuditLogEntry): string {
  return e.actor_full_name?.trim() || e.actor_username || 'Система';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AdminAuditPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getAuditLog({
        entityType: entityType || undefined,
        teamId: teamId || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(page.items);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить журнал');
    } finally {
      setLoading(false);
    }
  }, [entityType, teamId, offset]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<TeamOption[]>('/teams')
      .then((rows) => setTeams(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setTeams([]));
  }, [isAdmin]);

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

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="flex items-center gap-3 mb-1">
        <ScrollText className="w-6 h-6 text-brand-400" />
        <h1 className="font-display text-heading-md text-neutral-1000">Журнал действий</h1>
      </div>
      <p className="text-sm text-neutral-700 mb-5">Полная история действий с картой и командами.</p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wider text-neutral-700">Тип</span>
          <select
            value={entityType}
            onChange={(e) => {
              setOffset(0);
              setEntityType(e.target.value);
            }}
            className="px-2 py-1.5 rounded-sm bg-neutral-100 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500"
          >
            {ENTITY_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wider text-neutral-700">Команда</span>
          <select
            value={teamId}
            onChange={(e) => {
              setOffset(0);
              setTeamId(e.target.value);
            }}
            className="px-2 py-1.5 rounded-sm bg-neutral-100 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500 max-w-[12rem]"
          >
            <option value="">Все команды</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-neutral-700">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-700">Записей нет.</div>
        ) : (
          <ul className="divide-y divide-neutral-300">
            {items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-0.5 flex-shrink-0 px-1.5 py-0.5 rounded-sm text-2xs font-medium ${
                    ENTITY_TINT[e.entity_type] ?? 'bg-neutral-200 text-neutral-800'
                  }`}
                >
                  {ENTITY_LABELS[e.entity_type] ?? e.entity_type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-1000">{e.summary}</p>
                  <p className="text-2xs text-neutral-600 mt-0.5">
                    {actorName(e)}
                    {e.team_name ? ` · ${e.team_name}` : ''} · {e.action}
                  </p>
                </div>
                <span className="flex-shrink-0 text-2xs text-neutral-600 whitespace-nowrap mt-0.5">
                  {formatTime(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between mt-4">
        <span className="text-2xs text-neutral-600">
          Всего: {total} · стр. {page}/{pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Назад
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}
