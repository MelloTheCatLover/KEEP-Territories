import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2, Hammer, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  deleteAllSectors,
  generateMap,
  getAdminMapStatus,
  getSectorsMap,
  type RingConfig,
  type RingDifficulty,
} from '../map/api';

const MAX_RINGS = 6;
const DEFAULT_RINGS: RingConfig[] = [
  { difficulty: 'hard' },
  { difficulty: 'medium' },
  { difficulty: 'easy' },
];
const DIFFICULTY_LABEL: Record<RingDifficulty, string> = {
  easy: 'Лёгкие',
  medium: 'Средние',
  hard: 'Сложные',
};
const DIFFICULTY_OPTIONS: RingDifficulty[] = ['easy', 'medium', 'hard'];

type State =
  | { status: 'loading' }
  | { status: 'ready'; count: number; teamsCount: number }
  | { status: 'error'; message: string };

export function AdminMapPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState<'generate' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rings, setRings] = useState<RingConfig[]>(DEFAULT_RINGS);

  const totalSectors = 1 + rings.reduce((sum, _, idx) => sum + 6 * (idx + 1), 0);
  const homeBaseCount = rings.length >= 1 ? 6 : 0;

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [sectors, status] = await Promise.all([getSectorsMap(), getAdminMapStatus()]);
      setState({ status: 'ready', count: sectors.length, teamsCount: status.teams_count });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить состояние карты';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  async function handleGenerate() {
    setBusy('generate');
    setActionError(null);
    setFlash(null);
    try {
      const result = await generateMap({ rings });
      setFlash(`Создано секторов: ${result.count}`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка генерации');
    } finally {
      setBusy(null);
    }
  }

  function setRingDifficulty(idx: number, diff: RingDifficulty) {
    setRings((prev) => prev.map((r, i) => (i === idx ? { difficulty: diff } : r)));
  }

  function addRing() {
    setRings((prev) => (prev.length >= MAX_RINGS ? prev : [...prev, { difficulty: 'easy' }]));
  }

  function removeRing(idx: number) {
    setRings((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function resetRings() {
    setRings(DEFAULT_RINGS);
  }

  async function handleDelete() {
    setBusy('delete');
    setActionError(null);
    setFlash(null);
    try {
      const result = await deleteAllSectors();
      const parts: string[] = [`Удалено секторов: ${result.deleted_count}`];
      if (result.deleted_teams_count > 0) {
        parts.push(`команд: ${result.deleted_teams_count}`);
      }
      setFlash(parts.join(', '));
      setConfirmOpen(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(null);
    }
  }

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

  const exists = state.status === 'ready' && state.count > 0;
  const teamsCount = state.status === 'ready' ? state.teamsCount : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Админ — карта</h1>
        <p className="text-sm text-neutral-700">Генерация и удаление игрового поля.</p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Состояние</h2>
            {state.status === 'loading' && (
              <p className="text-sm text-neutral-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                Проверка...
              </p>
            )}
            {state.status === 'error' && (
              <p className="text-sm text-danger-text">{state.message}</p>
            )}
            {state.status === 'ready' && (
              <>
                <p className="text-sm text-neutral-900">
                  Секторов: <span className="font-mono text-neutral-1000">{state.count}</span>
                  {exists ? ' — карта создана' : ' — карта не создана'}
                </p>
                <p className="text-sm text-neutral-900">
                  Команд: <span className="font-mono text-neutral-1000">{state.teamsCount}</span>
                </p>
              </>
            )}
          </div>
          <Button variant="secondary" onClick={() => void refresh()} disabled={state.status === 'loading'}>
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Обновить
            </span>
          </Button>
        </div>
      </Card>

      {flash && (
        <div className="bg-success-bg text-success-text text-sm px-3 py-2 rounded-sm border border-success/40">
          {flash}
        </div>
      )}
      {actionError && <ErrorBanner message={actionError} />}

      <Card>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
              Конфигурация колец
            </h2>
            <p className="text-sm text-neutral-700">
              Ядро в центре всегда одно. Каждое следующее кольцо окружает предыдущее.
              Внешнее кольцо содержит 6 домашних секторов в углах.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={resetRings}
            disabled={busy !== null || exists}
          >
            Сбросить
          </Button>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-sm bg-neutral-200 border border-neutral-400">
            <span className="font-mono text-xs text-neutral-700 w-16">Ядро</span>
            <span className="text-sm text-neutral-900">1 сектор · core</span>
          </div>
          {rings.map((ring, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-3 py-2 rounded-sm bg-neutral-200 border border-neutral-400"
            >
              <span className="font-mono text-xs text-neutral-700 w-16">
                Кольцо {idx + 1}
              </span>
              <span className="text-sm text-neutral-900 w-24">
                {6 * (idx + 1)} секторов
              </span>
              <select
                value={ring.difficulty}
                onChange={(e) => setRingDifficulty(idx, e.target.value as RingDifficulty)}
                disabled={busy !== null || exists}
                className="bg-neutral-100 border border-neutral-500 text-neutral-1000 text-sm px-2 py-1 rounded-sm focus:outline-none focus:border-brand-500 disabled:opacity-50"
              >
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </select>
              {idx === rings.length - 1 && (
                <span className="text-xs text-brand-300 ml-auto mr-2">+ домашние базы</span>
              )}
              <button
                type="button"
                onClick={() => removeRing(idx)}
                disabled={busy !== null || exists || rings.length <= 1}
                className="text-neutral-700 hover:text-danger-text disabled:opacity-30 disabled:hover:text-neutral-700"
                aria-label="Убрать кольцо"
                title="Убрать кольцо"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={addRing}
            disabled={busy !== null || exists || rings.length >= MAX_RINGS}
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Добавить кольцо
            </span>
          </Button>
          <p className="text-xs text-neutral-700">
            Итого: <span className="font-mono text-neutral-1000">{totalSectors}</span> секторов,{' '}
            <span className="font-mono text-neutral-1000">{homeBaseCount}</span> домашних
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">Действия</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => void handleGenerate()}
            disabled={busy !== null || exists}
            isLoading={busy === 'generate'}
          >
            <span className="flex items-center gap-2">
              <Hammer className="w-4 h-4" />
              Сгенерировать карту
            </span>
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmOpen(true)}
            disabled={busy !== null || !exists}
            isLoading={busy === 'delete'}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Удалить все секторы
            </span>
          </Button>
        </div>
        <p className="text-xs text-neutral-700 mt-3">
          Для генерации необходимо: 1 core; если есть кольца easy — 4 easy задания; если medium — 5 medium.
        </p>
      </Card>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
          onClick={busy ? undefined : () => setConfirmOpen(false)}
        >
          <div
            className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-display text-heading-sm text-neutral-1000">
                Удалить карту?
              </h2>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy !== null}
                className="text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {teamsCount > 0 && (
              <div className="flex items-start gap-2 bg-danger-bg border border-danger text-danger-text text-sm px-3 py-2 rounded-sm mb-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Вместе с картой будут удалены <b>{teamsCount}</b> {' '}
                  {teamsCount === 1 ? 'команда' : 'команды/команд'} со всей прогрессией.
                  Пользователи будут отключены от команд. Действие необратимо.
                </span>
              </div>
            )}
            {teamsCount === 0 && (
              <p className="text-sm text-neutral-700 mb-3">
                Все секторы будут удалены. Действие необратимо.
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={busy !== null}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDelete()}
                isLoading={busy === 'delete'}
                disabled={busy !== null}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
