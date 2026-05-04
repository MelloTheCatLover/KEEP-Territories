import { useMemo, useState } from 'react';
import { Loader2, X, Crosshair, Shield, ShieldOff, Swords } from 'lucide-react';
import { Button, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import type { ActionType, Sector } from './types';
import { formatSectorLabel } from './types';
import { startAction, type StartActionResponse } from './api';
import { TaskWheel } from './TaskWheel';

type Props = {
  sector: Sector;
  allSectors: Sector[];
  userTeamId: string;
  onCancel: () => void;
  onStarted: (submissionId: string) => void;
};

type AvailableAction = {
  type: ActionType;
  label: string;
  description: string;
  icon: typeof Crosshair;
};

const MAX_FORTIFICATION = 3;

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

function hasAdjacentOwned(sector: Sector, all: Sector[], teamId: string): boolean {
  const owned = new Set(
    all
      .filter((s) => s.captured_by_team_id === teamId)
      .map((s) => `${s.q}:${s.r}`),
  );
  return NEIGHBOR_OFFSETS.some(([dq, dr]) => owned.has(`${sector.q + dq}:${sector.r + dr}`));
}

function computeAvailable(
  sector: Sector,
  all: Sector[],
  teamId: string,
): { actions: AvailableAction[]; reason: string | null } {
  if (sector.current_action_type !== null) {
    return { actions: [], reason: 'По сектору уже есть заявка на рассмотрении' };
  }

  if (sector.is_home_base) {
    if (sector.captured_by_team_id === teamId) {
      if (sector.fortification_level >= MAX_FORTIFICATION) {
        return { actions: [], reason: 'Домашняя база укреплена до максимума' };
      }
      return {
        actions: [
          {
            type: 'fortify',
            label: 'Укрепить',
            description: `Повысить укрепление до ${sector.fortification_level + 1}`,
            icon: Shield,
          },
        ],
        reason: null,
      };
    }
    return { actions: [], reason: 'Чужую базу нельзя атаковать' };
  }

  if (sector.captured_by_team_id === teamId) {
    if (sector.fortification_level >= MAX_FORTIFICATION) {
      return { actions: [], reason: 'Сектор укреплён до максимума' };
    }
    return {
      actions: [
        {
          type: 'fortify',
          label: 'Укрепить',
          description: `Повысить укрепление до ${sector.fortification_level + 1}`,
          icon: Shield,
        },
      ],
      reason: null,
    };
  }

  const adjacent = hasAdjacentOwned(sector, all, teamId);
  if (!adjacent) {
    return { actions: [], reason: 'Сектор не граничит с вашими захваченными' };
  }

  if (sector.status === 'free') {
    return {
      actions: [
        {
          type: 'capture',
          label: 'Захватить',
          description: 'Открыть задание и забрать свободный сектор',
          icon: Crosshair,
        },
      ],
      reason: null,
    };
  }

  if (sector.status === 'captured' && sector.captured_by_team_id) {
    const actions: AvailableAction[] = [
      {
        type: 'recapture',
        label: 'Перехватить',
        description: 'Отобрать сектор у другой команды',
        icon: Swords,
      },
    ];
    if (sector.fortification_level > 0) {
      actions.push({
        type: 'remove_fortification',
        label: 'Снять укрепление',
        description: `Понизить укрепление до ${sector.fortification_level - 1}`,
        icon: ShieldOff,
      });
    }
    return { actions, reason: null };
  }

  return { actions: [], reason: 'Действие сейчас недоступно' };
}

export function SectorActionModal({ sector, allSectors, userTeamId, onCancel, onStarted }: Props) {
  const [busy, setBusy] = useState<ActionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wheel, setWheel] = useState<StartActionResponse | null>(null);

  const { actions, reason } = useMemo(
    () => computeAvailable(sector, allSectors, userTeamId),
    [sector, allSectors, userTeamId],
  );

  const label = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';

  async function handleStart(type: ActionType) {
    setBusy(type);
    setError(null);
    try {
      const result = await startAction(sector.id, type);
      const winnerId = result.submission.task_id;
      const showWheel =
        winnerId !== null &&
        result.task_pool.length >= 2 &&
        result.task_pool.some((t) => t.id === winnerId);
      if (showWheel) {
        setWheel(result);
      } else {
        onStarted(result.submission.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось начать действие');
      setBusy(null);
    }
  }

  const inWheel = wheel !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy || inWheel ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
              Сектор {label}
            </h2>
            <p className="text-xs text-neutral-700">
              {sector.difficulty.name} · ({sector.q}, {sector.r})
              {sector.fortification_level > 0 && ` · укр. ${sector.fortification_level}`}
            </p>
          </div>
          {!inWheel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy !== null}
              className="text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {error && <ErrorBanner message={error} />}

        {wheel && wheel.submission.task_id && (
          <TaskWheel
            pool={wheel.task_pool}
            winnerId={wheel.submission.task_id}
            onDone={() => onStarted(wheel.submission.id)}
          />
        )}

        {!inWheel && actions.length === 0 && reason && (
          <div className="text-sm text-neutral-700 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2">
            {reason}
          </div>
        )}

        {!inWheel && actions.length > 0 && (
          <div className="space-y-2">
            {actions.map((a) => {
              const Icon = a.icon;
              const loading = busy === a.type;
              return (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => void handleStart(a.type)}
                  disabled={busy !== null}
                  className="w-full flex items-start gap-3 text-left px-3 py-2.5 bg-neutral-200 hover:bg-neutral-300 border border-neutral-400 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 mt-0.5 text-brand-500 animate-spin flex-shrink-0" />
                  ) : (
                    <Icon className="w-5 h-5 mt-0.5 text-brand-400 flex-shrink-0" />
                  )}
                  <div>
                    <div className="font-display text-sm text-neutral-1000">{a.label}</div>
                    <div className="text-xs text-neutral-700">{a.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!inWheel && (
          <div className="flex items-center justify-end pt-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy !== null}>
              Закрыть
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
