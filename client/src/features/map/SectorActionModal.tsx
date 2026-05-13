import { useMemo, useState, type ReactNode } from 'react';
import {
  Loader2,
  X,
  Crosshair,
  Shield,
  ShieldOff,
  Swords,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Button, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import type { ActionType, Sector } from './types';
import { formatSectorLabel } from './types';
import { startAction, type StartActionResponse } from './api';
import { TaskWheel } from './TaskWheel';
import { difficultyColors } from '../../design-system/design-tokens';

type Props = {
  sector: Sector;
  allSectors: Sector[];
  userTeamId: string;
  userActiveSectorId: string | null;
  onCancel: () => void;
  onStarted: (submissionId: string) => void;
  onNavigateToActive: (sectorId: string) => void;
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

const ACTION_LABELS: Record<ActionType, string> = {
  capture: 'Захват',
  recapture: 'Перехват',
  fortify: 'Укрепление',
  remove_fortification: 'Снятие укрепления',
};

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

function emblemColors(slug: Sector['difficulty']['slug']): { bg: string; fg: string } {
  const bg = difficultyColors[slug];
  const fg = slug === 'core'
    ? 'var(--color-neutral-1000)'
    : 'var(--color-neutral-0)';
  return { bg, fg };
}

export function SectorActionModal({
  sector,
  allSectors,
  userTeamId,
  userActiveSectorId,
  onCancel,
  onStarted,
  onNavigateToActive,
}: Props) {
  const [busy, setBusy] = useState<ActionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wheel, setWheel] = useState<StartActionResponse | null>(null);

  const isThisSectorActive = userActiveSectorId === sector.id;
  const hasActiveElsewhere =
    userActiveSectorId !== null && userActiveSectorId !== sector.id;

  const { actions, reason } = useMemo(() => {
    if (hasActiveElsewhere || isThisSectorActive) {
      return { actions: [] as AvailableAction[], reason: null };
    }
    return computeAvailable(sector, allSectors, userTeamId);
  }, [sector, allSectors, userTeamId, hasActiveElsewhere, isThisSectorActive]);

  const label = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';

  const titleText = sector.is_home_base ? 'Домашняя база' : `Сектор ${label}`;

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
  const lockClose = busy !== null || inWheel;
  const showActions =
    !inWheel && !hasActiveElsewhere && !isThisSectorActive;
  const { bg: emblemBg, fg: emblemFg } = emblemColors(sector.difficulty.slug);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={lockClose ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 border border-neutral-400 rounded-md w-full max-w-lg shadow-3 overflow-hidden"
      >
        <header className="flex items-center gap-4 px-5 py-4 bg-neutral-100 border-b border-neutral-300">
          <div
            aria-hidden
            className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-md font-display font-bold text-xl shadow-2"
            style={{ backgroundColor: emblemBg, color: emblemFg }}
          >
            {label}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-heading-sm text-neutral-1000 leading-tight truncate">
              {titleText}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Chip>{sector.difficulty.name}</Chip>
              <Chip>
                <span className="font-mono">
                  ({sector.q}, {sector.r})
                </span>
              </Chip>
              {sector.fortification_level > 0 && (
                <Chip>
                  <Shield className="w-3 h-3 mr-1" />
                  укр. {sector.fortification_level}
                </Chip>
              )}
            </div>
          </div>
          {!lockClose && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-shrink-0 p-1 -mr-1 text-neutral-700 hover:text-neutral-1000 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <div className="p-5 space-y-4">
          {error && <ErrorBanner message={error} />}

          {wheel && wheel.submission.task_id && (
            <TaskWheel
              pool={wheel.task_pool}
              winnerId={wheel.submission.task_id}
              onDone={() => onStarted(wheel.submission.id)}
            />
          )}

          {!inWheel && hasActiveElsewhere && userActiveSectorId && (
            <BlockedElsewherePanel
              onNavigate={() => onNavigateToActive(userActiveSectorId)}
            />
          )}

          {!inWheel && isThisSectorActive && (
            <InProgressPanel
              actionType={sector.current_action_type}
              onOpen={() => onNavigateToActive(sector.id)}
            />
          )}

          {showActions && actions.length === 0 && reason && (
            <NoActionsPanel reason={reason} />
          )}

          {showActions && actions.length > 0 && (
            <ActionsList
              actions={actions}
              busy={busy}
              onStart={(type) => void handleStart(type)}
            />
          )}

          {!inWheel && (
            <div className="flex items-center justify-end pt-1">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={busy !== null}
              >
                Закрыть
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-2xs uppercase tracking-wider text-neutral-800 bg-neutral-200 rounded-xs border border-neutral-400">
      {children}
    </span>
  );
}

function BlockedElsewherePanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex gap-3 p-4 bg-warning-bg border border-warning rounded-sm">
      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-warning-text mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="font-display text-base text-warning-text">
          Команда занята другим действием
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed">
          Нельзя начать новое действие, пока есть незавершённая заявка.
          Завершите выполнение или сбросьте текущий сектор.
        </p>
        <Button variant="primary" onClick={onNavigate} className="text-sm">
          <span className="inline-flex items-center gap-1.5">
            Перейти к активному сектору
            <ArrowRight className="w-4 h-4" />
          </span>
        </Button>
      </div>
    </div>
  );
}

function InProgressPanel({
  actionType,
  onOpen,
}: {
  actionType: ActionType | null;
  onOpen: () => void;
}) {
  const desc = actionType ? ACTION_LABELS[actionType] : 'Действие';
  return (
    <div className="flex gap-3 p-4 bg-info-bg border border-info rounded-sm">
      <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-info-text mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="font-display text-base text-info-text">
          {desc} · в процессе
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed">
          По этому сектору у вашей команды есть активная заявка.
          Откройте задание, чтобы продолжить выполнение.
        </p>
        <Button variant="primary" onClick={onOpen} className="text-sm">
          <span className="inline-flex items-center gap-1.5">
            Открыть задание
            <ArrowRight className="w-4 h-4" />
          </span>
        </Button>
      </div>
    </div>
  );
}

function NoActionsPanel({ reason }: { reason: string }) {
  return (
    <div className="flex gap-2.5 p-3 bg-neutral-200 border border-neutral-400 rounded-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-neutral-700 mt-0.5" />
      <p className="text-sm text-neutral-700 leading-relaxed">{reason}</p>
    </div>
  );
}

function ActionsList({
  actions,
  busy,
  onStart,
}: {
  actions: AvailableAction[];
  busy: ActionType | null;
  onStart: (type: ActionType) => void;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
        Доступные действия
      </div>
      <div className="space-y-2">
        {actions.map((a) => {
          const Icon = a.icon;
          const loading = busy === a.type;
          return (
            <button
              key={a.type}
              type="button"
              onClick={() => onStart(a.type)}
              disabled={busy !== null}
              className="group w-full flex items-center gap-3 text-left px-4 py-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-400 hover:border-brand-500 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xs bg-brand-900/40 border border-brand-700 group-hover:bg-brand-700 group-hover:border-brand-500 transition-colors">
                {loading ? (
                  <Loader2 className="w-5 h-5 text-brand-300 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5 text-brand-300 group-hover:text-neutral-1000 transition-colors" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-base text-neutral-1000">
                  {a.label}
                </div>
                <div className="text-xs text-neutral-700 mt-0.5">
                  {a.description}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-neutral-700 group-hover:text-brand-300 transition-colors flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
