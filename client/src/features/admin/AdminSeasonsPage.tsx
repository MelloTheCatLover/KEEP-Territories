import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Archive, CheckCircle2, Loader2, Plus, Play, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  getSeasons,
  createSeason,
  setSeasonLists,
  activateSeason,
  archiveSeason,
  setSeasonMvp,
  deleteSeason,
  type Season,
  type SeasonStatus,
} from './seasons-api';
import { getRoster, type RosterMember } from './teams-api';
import { getLists, type ChildrenList } from './children-lists-api';
import { AccessDenied, AdminPageHeader } from './AdminShell';

const STATUS_META: Record<SeasonStatus, { label: string; cls: string }> = {
  active: { label: 'активный', cls: 'bg-success-bg text-success-text border-success/40' },
  draft: { label: 'черновик', cls: 'bg-neutral-200 text-neutral-900 border-neutral-400' },
  archived: { label: 'архив', cls: 'bg-warning-bg text-warning-text border-warning/40' },
};

export function AdminSeasonsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [lists, setLists] = useState<ChildrenList[]>([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, l] = await Promise.all([getSeasons(), getLists()]);
      setSeasons(s);
      setLists(l);
      // Roster (for the MVP picker) needs an active season; ignore if absent.
      const roster = await getRoster().catch(() => [] as RosterMember[]);
      setRoster(roster);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить сезоны');
    }
  }, []);

  async function handleSetMvp(season: Season, childId: string | null) {
    setBusyId(season.id);
    setActionError(null);
    try {
      await setSeasonMvp(season.id, childId);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось назначить MVP');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setActionError(null);
    try {
      await createSeason(name);
      setNewName('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка создания сезона');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleList(season: Season, listId: string) {
    const next = season.list_ids.includes(listId)
      ? season.list_ids.filter((id) => id !== listId)
      : [...season.list_ids, listId];
    setBusyId(season.id);
    setActionError(null);
    try {
      await setSeasonLists(season.id, next);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка привязки списка');
    } finally {
      setBusyId(null);
    }
  }

  async function handleActivate(season: Season) {
    if (
      !confirm(
        `Сделать «${season.name}» активным? Текущий активный сезон уйдёт в архив, ` +
          `а участники его команд будут отвязаны.`,
      )
    )
      return;
    setBusyId(season.id);
    setActionError(null);
    try {
      await activateSeason(season.id);
      setFlash(`Сезон «${season.name}» активирован`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка активации');
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(season: Season) {
    if (
      !confirm(
        `Завершить смену «${season.name}» и отправить в архив? Участники его команд ` +
          `будут отвязаны, а карта останется доступной только для просмотра.`,
      )
    )
      return;
    setBusyId(season.id);
    setActionError(null);
    try {
      await archiveSeason(season.id);
      setFlash(`Смена «${season.name}» отправлена в архив`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка архивации');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(season: Season) {
    if (!confirm(`Удалить сезон «${season.name}» вместе с его картой и командами? Действие необратимо.`))
      return;
    setBusyId(season.id);
    setActionError(null);
    try {
      await deleteSeason(season.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <AdminPageHeader
        title="Сезоны"
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4" />Обновить</span>
          </Button>
        }
      />

      {flash && (
        <div className="bg-success-bg text-success-text text-sm px-3 py-2 rounded-sm border border-success/40 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {flash}
        </div>
      )}
      {loadError && <ErrorBanner message={loadError} />}
      {actionError && <ErrorBanner message={actionError} />}

      <Card>
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="new-season">Новый сезон</Label>
            <Input
              id="new-season"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: Смена Июнь"
              disabled={creating}
            />
          </div>
          <Button type="submit" variant="primary" isLoading={creating} disabled={!newName.trim()}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Создать</span>
          </Button>
        </form>
      </Card>

      {seasons === null ? (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      ) : seasons.length === 0 ? (
        <p className="text-sm text-neutral-700">Сезонов пока нет.</p>
      ) : (
        <div className="space-y-3">
          {seasons.map((season) => {
            const meta = STATUS_META[season.status];
            const busy = busyId === season.id;
            return (
              <Card key={season.id}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-heading-sm text-neutral-1000">{season.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-sm border ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <div className="flex gap-2">
                    {season.status === 'active' && (
                      <Link
                        to={`/seasons/${season.id}/finals`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-sm bg-brand-700 text-neutral-1000 hover:bg-brand-600 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Провести итоги
                      </Link>
                    )}
                    {season.status === 'active' && (
                      <Button variant="secondary" onClick={() => void handleArchive(season)} disabled={busy}>
                        <span className="flex items-center gap-1.5"><Archive className="w-4 h-4" />Завершить в архив</span>
                      </Button>
                    )}
                    {season.status !== 'active' && (
                      <Button variant="primary" onClick={() => void handleActivate(season)} disabled={busy}>
                        <span className="flex items-center gap-1.5"><Play className="w-4 h-4" />Активировать</span>
                      </Button>
                    )}
                    {season.status !== 'active' && (
                      <button
                        type="button"
                        className="text-error hover:opacity-80 p-1"
                        onClick={() => void handleDelete(season)}
                        disabled={busy}
                        title="Удалить сезон"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-neutral-700 mb-2">Списки детей с доступом:</div>
                  {lists.length === 0 ? (
                    <p className="text-sm text-neutral-700">Сначала создайте списки детей.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {lists.map((list) => {
                        const linked = season.list_ids.includes(list.id);
                        return (
                          <button
                            key={list.id}
                            type="button"
                            onClick={() => void handleToggleList(season, list.id)}
                            disabled={busy}
                            className={`text-sm px-3 py-1 rounded-sm border transition-colors ${
                              linked
                                ? 'bg-brand-500/15 border-brand-500 text-neutral-1000'
                                : 'border-neutral-400 text-neutral-700 hover:border-brand-500'
                            }`}
                          >
                            {list.name}
                            <span className="text-xs text-neutral-700"> · {list.entry_count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {season.status === 'active' && (
                  <div className="mt-3 pt-3 border-t border-neutral-400">
                    <div className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
                      <Star className="w-4 h-4 text-warning" />
                      MVP смены (объявляется на итогах):
                    </div>
                    {roster.length === 0 ? (
                      <p className="text-sm text-neutral-700">
                        Ростер пуст — сначала привяжите списки и подготовьте распределение.
                      </p>
                    ) : (
                      <select
                        value={season.mvp_child_id ?? ''}
                        disabled={busy}
                        onChange={(e) => void handleSetMvp(season, e.target.value || null)}
                        className="text-sm bg-neutral-100 border border-neutral-400 rounded-sm px-3 py-2 text-neutral-1000 disabled:opacity-50 w-full max-w-sm"
                      >
                        <option value="">— не выбран —</option>
                        {roster.map((r) => (
                          <option key={r.child_id} value={r.child_id}>
                            {r.full_name ?? '—'}
                            {r.team_name ? ` · ${r.team_name}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
