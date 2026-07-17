import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getSectorsMap } from '../map/api';
import { formatSectorLabel, type DifficultySlug, type Sector } from '../map/types';
import { getTasks, type TaskSummary } from './tasks-api';
import {
  attachSectorTask,
  detachSectorTask,
  getAllBindings,
  getSectorTasks,
  type Binding,
  type SectorTaskRow,
} from './sector-tasks-api';
import { AccessDenied, AdminPageHeader } from './AdminShell';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      sectors: Sector[];
      tasks: TaskSummary[];
      bindings: Binding[];
    };

const DIFF_LABEL: Record<DifficultySlug, string> = {
  easy: 'Лёгкие',
  medium: 'Средние',
  hard: 'Сложные',
  core: 'Ядро',
};

const FILTER_ORDER: DifficultySlug[] = ['easy', 'medium', 'hard', 'core'];

const MIN_TASKS_PER_SECTOR: Record<DifficultySlug, number> = {
  easy: 3,
  medium: 3,
  hard: 1,
  core: 0,
};

export function AdminSectorTasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [filter, setFilter] = useState<DifficultySlug | 'all'>('easy');
  const [managing, setManaging] = useState<Sector | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [sectors, tasks, bindingsRes] = await Promise.all([
        getSectorsMap(),
        getTasks(),
        getAllBindings(),
      ]);
      setState({ status: 'ready', sectors, tasks, bindings: bindingsRes.bindings });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить',
      });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const bindingCount = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, number>();
    const m = new Map<string, number>();
    for (const b of state.bindings) m.set(b.sector_id, (m.get(b.sector_id) ?? 0) + 1);
    return m;
  }, [state]);

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      <AdminPageHeader
        title="Привязка заданий"
        actions={
          <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={state.status === 'loading'}
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Обновить
          </span>
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs uppercase tracking-wider text-neutral-700">
          Фильтр
        </span>
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="Все"
        />
        {FILTER_ORDER.map((slug) => (
          <FilterChip
            key={slug}
            active={filter === slug}
            onClick={() => setFilter(slug)}
            label={DIFF_LABEL[slug]}
          />
        ))}
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          Загрузка...
        </div>
      )}
      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && (
        <div className="grid gap-2">
          {state.sectors
            .filter((s) =>
              filter === 'all' ? true : s.difficulty.slug === filter,
            )
            .sort((a, b) => {
              const di = FILTER_ORDER.indexOf(a.difficulty.slug);
              const dj = FILTER_ORDER.indexOf(b.difficulty.slug);
              if (di !== dj) return di - dj;
              return (a.number ?? -1) - (b.number ?? -1);
            })
            .map((s) => (
              <SectorRow
                key={s.id}
                sector={s}
                count={bindingCount.get(s.id) ?? 0}
                onManage={() => setManaging(s)}
              />
            ))}
        </div>
      )}

      {managing && state.status === 'ready' && (
        <ManageModal
          sector={managing}
          allTasks={state.tasks.filter(
            (t) => t.difficulty.slug === managing.difficulty.slug,
          )}
          onClose={() => setManaging(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-xs border text-sm transition-colors ${
        active
          ? 'border-brand-500 bg-brand-900/30 text-neutral-1000'
          : 'border-neutral-400 bg-neutral-200 text-neutral-700 hover:border-neutral-600'
      }`}
    >
      {label}
    </button>
  );
}

function SectorRow({
  sector,
  count,
  onManage,
}: {
  sector: Sector;
  count: number;
  onManage: () => void;
}) {
  const label = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';
  const min = MIN_TASKS_PER_SECTOR[sector.difficulty.slug];
  const below = count < min;
  return (
    <div className="border border-neutral-400 rounded-sm bg-neutral-100 px-3 py-2 flex items-center gap-3">
      <div className="font-mono text-sm text-neutral-1000 w-12">{label}</div>
      <div className="text-xs text-neutral-700 flex-1 min-w-0">
        <span className="text-neutral-1000">{sector.difficulty.name}</span>
        <span className="mx-1">·</span>
        <span className="font-mono">
          ({sector.q}, {sector.r})
        </span>
        {sector.is_home_base && <span className="ml-2 text-brand-300">база</span>}
      </div>
      <div
        className={`text-sm font-mono tabular-nums px-2 py-0.5 rounded-xs border ${
          below
            ? 'border-warning text-warning-text bg-warning-bg'
            : 'border-neutral-400 text-neutral-1000 bg-neutral-200'
        }`}
        title={
          below
            ? `Минимум ${min} заданий для этой сложности`
            : `${count} заданий`
        }
      >
        {count}
      </div>
      <Button variant="secondary" onClick={onManage} className="text-sm">
        Управлять
      </Button>
    </div>
  );
}

function ManageModal({
  sector,
  allTasks,
  onClose,
  onChanged,
}: {
  sector: Sector;
  allTasks: TaskSummary[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<SectorTaskRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string>('');

  const refetch = useCallback(async () => {
    try {
      const res = await getSectorTasks(sector.id);
      setTasks(res.tasks);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить');
    }
  }, [sector.id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const attachedIds = useMemo(
    () => new Set((tasks ?? []).map((t) => t.task_id)),
    [tasks],
  );
  const available = useMemo(
    () => allTasks.filter((t) => !attachedIds.has(t.id)),
    [allTasks, attachedIds],
  );

  async function handleAdd() {
    if (!pickId) return;
    setBusy(`add:${pickId}`);
    setOpError(null);
    try {
      const res = await attachSectorTask(sector.id, pickId);
      setTasks(res.tasks);
      setPickId('');
      onChanged();
    } catch (err) {
      setOpError(err instanceof ApiError ? err.message : 'Не удалось добавить');
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(taskId: string) {
    setBusy(`del:${taskId}`);
    setOpError(null);
    try {
      const res = await detachSectorTask(sector.id, taskId);
      setTasks(res.tasks);
      onChanged();
    } catch (err) {
      setOpError(err instanceof ApiError ? err.message : 'Не удалось удалить');
    } finally {
      setBusy(null);
    }
  }

  const sectorLabel = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 border border-neutral-400 rounded-md w-full max-w-2xl shadow-3 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <header className="flex items-center gap-3 px-5 py-4 bg-neutral-100 border-b border-neutral-300">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000">
              Сектор {sectorLabel}
            </h2>
            <p className="text-xs text-neutral-700 mt-0.5">
              {sector.difficulty.name} · ({sector.q}, {sector.r})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="ml-auto text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto">
          {loadError && <ErrorBanner message={loadError} />}
          {opError && <ErrorBanner message={opError} />}

          <section>
            <h3 className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
              Привязанные задания ({tasks?.length ?? 0})
            </h3>
            {tasks === null ? (
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                Загрузка...
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-neutral-700">Заданий пока нет.</p>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <li
                    key={t.task_id}
                    className="flex items-center gap-2 px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-neutral-1000 truncate">
                        {t.title}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemove(t.task_id)}
                      disabled={busy !== null}
                      className="text-danger-text hover:text-danger flex items-center gap-1 text-xs disabled:opacity-50"
                      title="Открепить"
                    >
                      {busy === `del:${t.task_id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Открепить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
              Привязать задание
            </h3>
            {available.length === 0 ? (
              <p className="text-sm text-neutral-700">
                Нет свободных заданий для сложности «{sector.difficulty.name}».
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                  disabled={busy !== null}
                  className="flex-1 bg-neutral-100 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000 disabled:opacity-50"
                >
                  <option value="">— выберите задание —</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  onClick={() => void handleAdd()}
                  disabled={busy !== null || !pickId}
                  isLoading={busy === `add:${pickId}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    Добавить
                  </span>
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

