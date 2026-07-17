import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Trash2, Hammer, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  deleteAllSectors,
  generateMap,
  getAdminMapStatus,
  getMapPresets,
  getSectorsMap,
  type MapPreset,
  type MapPresetCell,
} from '../map/api';
import { axialToPixel, hexPoints, bbox } from '../map/hex-utils';
import { difficultyColors } from '../../design-system/design-tokens';
import { AccessDenied, AdminPageHeader } from './AdminShell';

type State =
  | { status: 'loading' }
  | { status: 'ready'; count: number; teamsCount: number }
  | { status: 'error'; message: string };

export function AdminMapPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<State>({ status: 'loading' });
  const [presets, setPresets] = useState<MapPreset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isAdmin) return;
    getMapPresets()
      .then((res) => {
        setPresets(res.presets);
        setSelected((cur) => cur ?? res.default);
      })
      .catch(() => setActionError('Не удалось загрузить пресеты карты'));
  }, [isAdmin]);

  const preset = presets.find((p) => p.id === selected) ?? null;

  async function handleGenerate() {
    if (!preset) return;
    setBusy('generate');
    setActionError(null);
    setFlash(null);
    try {
      const result = await generateMap(preset.id);
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
      <AdminPageHeader
        title="Генерация карты"
        actions={
          <Button variant="secondary" onClick={() => void refresh()} disabled={state.status === 'loading'}>
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Обновить
            </span>
          </Button>
        }
      />

      <Card>
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-neutral-900">
            <span>
              Секторов: <span className="font-mono text-neutral-1000">{state.count}</span>
              {exists ? '' : ' — карта не создана'}
            </span>
            <span>
              Команд: <span className="font-mono text-neutral-1000">{state.teamsCount}</span>
            </span>
          </div>
        )}
      </Card>

      {flash && (
        <div className="bg-success-bg text-success-text text-sm px-3 py-2 rounded-sm border border-success/40">
          {flash}
        </div>
      )}
      {actionError && <ErrorBanner message={actionError} />}

      {presets.length > 0 && (
        <Card>
          <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">Пресет</h2>
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {presets.map((p) => {
              const active = p.id === selected;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={`text-left px-4 py-3 rounded-sm border transition-colors ${
                    active
                      ? 'border-brand-500 bg-brand-900/30'
                      : 'border-neutral-400 bg-neutral-200 hover:border-neutral-600'
                  }`}
                >
                  <div className="text-sm font-medium text-neutral-1000">{p.title}</div>
                  <div className="text-xs text-neutral-700 mt-0.5">{p.description}</div>
                </button>
              );
            })}
          </div>

          {preset && (
            <>
              <PresetPreview cells={preset.cells} />
              <PresetLegend cells={preset.cells} />
            </>
          )}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => void handleGenerate()}
            disabled={busy !== null || !preset}
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
          6 easy, 5 medium; сложные сектора получают весь пул сложных.
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

const PREVIEW_HEX = 10;
const SPECIAL_FILL = 'var(--color-neutral-400)';
const HOME_FILL = 'var(--color-neutral-100)';

/** Miniature of the preset: difficulty colours, dark specials, K on the bases. */
function PresetPreview({ cells }: { cells: MapPresetCell[] }) {
  const { minX, minY, maxX, maxY } = useMemo(() => bbox(cells, PREVIEW_HEX), [cells]);
  const pad = 4;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

  return (
    <svg viewBox={vb} className="w-full max-w-md mx-auto block" role="img" aria-label="Схема пресета">
      {cells.map((c) => {
        const { x, y } = axialToPixel(c.q, c.r, PREVIEW_HEX);
        const fill = c.isSpecial
          ? SPECIAL_FILL
          : c.isHome
            ? HOME_FILL
            : difficultyColors[c.slug];
        return (
          <g key={`${c.q},${c.r}`}>
            <polygon
              points={hexPoints(x, y, PREVIEW_HEX - 0.6)}
              fill={fill}
              stroke={c.isHome ? 'var(--color-neutral-1000)' : 'var(--color-neutral-50)'}
              strokeWidth={c.isHome ? 1.2 : 0.6}
              opacity={c.isSpecial ? 1 : 0.9}
            />
            {c.isHome && (
              <text
                x={x}
                y={y + 3.2}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="var(--color-neutral-1000)"
              >
                K
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PresetLegend({ cells }: { cells: MapPresetCell[] }) {
  const counts = useMemo(() => {
    const c = { easy: 0, medium: 0, hard: 0, core: 0, special: 0, home: 0 };
    for (const cell of cells) {
      if (cell.isHome) c.home += 1;
      else if (cell.isSpecial) c.special += 1;
      else c[cell.slug] += 1;
    }
    return c;
  }, [cells]);

  const items: Array<{ label: string; count: number; fill: string }> = [
    { label: 'Лёгкие', count: counts.easy, fill: difficultyColors.easy },
    { label: 'Средние', count: counts.medium, fill: difficultyColors.medium },
    { label: 'Сложные', count: counts.hard, fill: difficultyColors.hard },
    { label: 'Ядро', count: counts.core, fill: difficultyColors.core },
    { label: 'Особые', count: counts.special, fill: SPECIAL_FILL },
    { label: 'Базы', count: counts.home, fill: HOME_FILL },
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-neutral-800">
          <span
            aria-hidden
            className="w-3 h-3 rounded-xs inline-block border border-neutral-500"
            style={{ backgroundColor: i.fill }}
          />
          {i.label} <span className="font-mono text-neutral-1000">{i.count}</span>
        </span>
      ))}
    </div>
  );
}
