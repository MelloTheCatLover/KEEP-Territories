import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Trash2, Hammer, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { deleteAllSectors, generateMap, getAdminMapStatus, getSectorsMap } from '../map/api';
import { AccessDenied, AdminPageHeader } from './AdminShell';

// Fixed preset (radius 5) — must mirror buildPresetCells on the server.
const PRESET_RINGS: Array<{ label: string; detail: string }> = [
  { label: 'Ядро', detail: '1 сектор · core' },
  { label: 'Кольцо 1', detail: '6 секторов · сложные' },
  { label: 'Кольцо 2', detail: '12 секторов · средние через один с особыми (тёмно-серые)' },
  { label: 'Кольцо 3', detail: '18 секторов · средние' },
  { label: 'Кольцо 4', detail: '24 сектора · лёгкие, 8 домашних баз через каждые 3 клетки' },
  { label: 'Кольцо 5', detail: '30 секторов · лёгкие, тыл за базами' },
];
const PRESET_TOTAL = 91;
const PRESET_HOME_BASES = 8;

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
      const result = await generateMap();
      setFlash(`Карта собрана: ${result.count} секторов. Команды и распределение сохранены.`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка генерации');
    } finally {
      setBusy(null);
    }
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

  if (!isAdmin) return <AccessDenied />;

  const exists = state.status === 'ready' && state.count > 0;
  const teamsCount = state.status === 'ready' ? state.teamsCount : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <AdminPageHeader title="Генерация карты" />

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
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Раскладка</h2>
        <p className="text-sm text-neutral-700 mb-3">
          Шесть колец от ядра наружу. Тёмно-серые сектора особых событий обычным
          захватом недоступны. 8 домашних баз стоят равномерно на кольце 4 — у
          каждой команды есть тыл из лёгких секторов.
        </p>
        <div className="space-y-2">
          {PRESET_RINGS.map((ring) => (
            <div
              key={ring.label}
              className="flex items-center gap-3 px-3 py-2 rounded-sm bg-neutral-200 border border-neutral-400"
            >
              <span className="font-mono text-xs text-neutral-700 w-16">{ring.label}</span>
              <span className="text-sm text-neutral-900">{ring.detail}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-700 mt-3">
          Итого: <span className="font-mono text-neutral-1000">{PRESET_TOTAL}</span> секторов,{' '}
          <span className="font-mono text-neutral-1000">{PRESET_HOME_BASES}</span> домашних
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">Действия</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => void handleGenerate()}
            disabled={busy !== null}
            isLoading={busy === 'generate'}
          >
            <span className="flex items-center gap-2">
              <Hammer className="w-4 h-4" />
              {exists ? 'Пересобрать карту' : 'Сгенерировать карту'}
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
          Пересборка сохраняет команды и распределение детей — они переносятся на новые
          домашние базы. Прогресс захватов на поле сбрасывается. Нужны задания: 1 core,
          4 easy, 5 medium.
        </p>
      </Card>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
          onClick={busy ? undefined : () => setConfirmOpen(false)}
        >
          <div
            className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3"
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
                  Пользователи будут отключены от команд. Действие необратимо. Чтобы
                  сменить карту, сохранив команды, используйте «Пересобрать карту».
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
