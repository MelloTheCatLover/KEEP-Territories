import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Trash2, Hammer } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { deleteAllSectors, generateMap, getSectorsMap } from '../map/api';

type State =
  | { status: 'loading' }
  | { status: 'ready'; count: number }
  | { status: 'error'; message: string };

export function AdminMapPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState<'generate' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const sectors = await getSectorsMap();
      setState({ status: 'ready', count: sectors.length });
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
      setFlash(`Создано секторов: ${result.count}`);
      setState({ status: 'ready', count: result.count });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка генерации');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Удалить все секторы? Действие необратимо.')) return;
    setBusy('delete');
    setActionError(null);
    setFlash(null);
    try {
      const result = await deleteAllSectors();
      setFlash(`Удалено секторов: ${result.deleted_count}`);
      setState({ status: 'ready', count: 0 });
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
              <p className="text-sm text-neutral-900">
                Секторов: <span className="font-mono text-neutral-1000">{state.count}</span>
                {exists ? ' — карта создана' : ' — карта не создана'}
              </p>
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
            onClick={() => void handleDelete()}
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
          Для генерации необходимо не менее 4 easy, 5 medium и 1 core задания в базе.
        </p>
      </Card>
    </div>
  );
}
