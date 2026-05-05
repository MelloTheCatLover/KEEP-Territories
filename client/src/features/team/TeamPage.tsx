import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Crown, LogOut, Loader2, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getSettings, type GameSetting } from '../admin/settings-api';
import { getTeamStats, leaveTeam, transferCaptain, upgradeStat } from './api';
import type { StatName, TeamFullStats } from './types';
import type { User } from '../auth/types';
import { JoinOrCreateView } from './JoinOrCreateView';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TeamFullStats; settings: GameSetting[] };

const STAT_META: Record<StatName, { label: string; hint: string }> = {
  strength: { label: 'Сила', hint: 'Влияет на захват' },
  intelligence: { label: 'Интеллект', hint: 'Влияет на задания' },
  endurance: { label: 'Выносливость', hint: 'Влияет на удержание' },
  leadership: { label: 'Лидерство', hint: 'Влияет на команду' },
  luck: { label: 'Удача', hint: 'Случайные бонусы' },
};

const STAT_ORDER: StatName[] = ['strength', 'intelligence', 'endurance', 'leadership', 'luck'];

function computeLevelProgress(
  experience: number,
  settings: GameSetting[],
): { inLevel: number; toNext: number } {
  const base = Number(settings.find((s) => s.key === 'base_exp_threshold')?.value ?? 50);
  const step = Number(settings.find((s) => s.key === 'exp_step')?.value ?? 10);
  let remaining = experience;
  let threshold = base;
  while (remaining >= threshold) {
    remaining -= threshold;
    threshold += step;
  }
  return { inLevel: remaining, toNext: threshold };
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'leave-confirm' }
  | { kind: 'transfer'; afterLeave: boolean };

export function TeamPage() {
  const { user, refreshUser } = useAuth();
  const teamId = user?.team_id ?? null;
  const isCaptain = user?.team_role === 'captain';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [upgrading, setUpgrading] = useState<StatName | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) {
      setState({ status: 'loading' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const [data, settings] = await Promise.all([getTeamStats(teamId), getSettings()]);
      setState({ status: 'ready', data, settings });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить команду',
      });
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpgrade(statName: StatName) {
    if (!teamId || !isCaptain) return;
    setUpgrading(statName);
    setActionError(null);
    try {
      const data = await upgradeStat(teamId, { stat_name: statName });
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, data } : prev,
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка апгрейда');
    } finally {
      setUpgrading(null);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setActionError(null);
    try {
      await leaveTeam();
      await refreshUser();
      setModal({ kind: 'none' });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось покинуть команду');
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(newCaptainId: string, afterLeave: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      const next = await transferCaptain({ newCaptainId });
      if (afterLeave) {
        await leaveTeam();
        await refreshUser();
      } else {
        await refreshUser();
        setState((prev) =>
          prev.status === 'ready' ? { ...prev, data: next } : prev,
        );
      }
      setModal({ kind: 'none' });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось передать капитанство');
    } finally {
      setBusy(false);
    }
  }

  function requestLeave() {
    if (state.status !== 'ready') return;
    const hasOtherMembers = state.data.members.some((m) => m.id !== user?.id);
    if (isCaptain && hasOtherMembers) {
      setModal({ kind: 'transfer', afterLeave: true });
    } else {
      setModal({ kind: 'leave-confirm' });
    }
  }

  const progress = useMemo(() => {
    if (state.status !== 'ready') return null;
    return computeLevelProgress(state.data.experience, state.settings);
  }, [state]);

  if (!teamId) {
    return <JoinOrCreateView />;
  }

  if (state.status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <ErrorBanner message={state.message} />
      </div>
    );
  }

  const { data } = state;
  const canUpgrade = isCaptain && data.available_upgrade_points > 0;
  const otherMembers = data.members.filter((m) => m.id !== user?.id);
  const hasOtherMembers = otherMembers.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <Card>
        <div className="flex items-stretch gap-4">
          <div
            className="w-1 self-stretch rounded-full flex-shrink-0"
            style={{ backgroundColor: data.color ?? 'var(--color-neutral-400)' }}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-heading-md text-neutral-1000 truncate">
              {data.name}
            </h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <StatBlock label="Влияние" value={data.influence} />
              <StatBlock label="Опыт" value={data.experience} />
              <StatBlock label="Уровень" value={data.level} />
              <StatBlock label="Сектора" value={data.captured_sectors_count} />
            </div>
            {progress && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-xs text-neutral-700 mb-1">
                  <span>Прогресс до уровня {data.level + 1}</span>
                  <span className="font-mono">
                    {progress.inLevel} / {progress.toNext}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{
                      width: `${Math.min(100, (progress.inLevel / progress.toNext) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {actionError && <ErrorBanner message={actionError} />}

      <div className="flex flex-wrap items-center gap-2">
        {isCaptain && hasOtherMembers && (
          <Button
            variant="secondary"
            onClick={() => setModal({ kind: 'transfer', afterLeave: false })}
            disabled={busy}
          >
            <span className="flex items-center gap-2">
              <UserCog className="w-4 h-4" />
              Передать капитанство
            </span>
          </Button>
        )}
        <Button variant="danger" onClick={requestLeave} disabled={busy}>
          <span className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Покинуть команду
          </span>
        </Button>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-heading-sm text-neutral-1000">Характеристики</h2>
          <div className="text-sm text-neutral-700">
            Очки апгрейда:{' '}
            <span
              className={
                data.available_upgrade_points > 0
                  ? 'font-mono text-success-text'
                  : 'font-mono text-neutral-700'
              }
            >
              {data.available_upgrade_points}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STAT_ORDER.map((name) => {
            const meta = STAT_META[name];
            const value = data.stats[name];
            const disabled = !canUpgrade || upgrading !== null;
            return (
              <Card key={name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg text-neutral-1000 break-words">
                      {meta.label}
                    </div>
                    <p className="text-xs text-neutral-700 mt-0.5">{meta.hint}</p>
                    <div className="font-mono text-2xl text-neutral-1000 mt-2">{value}</div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => void handleUpgrade(name)}
                    disabled={disabled}
                    isLoading={upgrading === name}
                    className="flex-shrink-0"
                    title={
                      !isCaptain
                        ? 'Только капитан может улучшать характеристики'
                        : data.available_upgrade_points === 0
                        ? 'Нет доступных очков апгрейда'
                        : undefined
                    }
                  >
                    +1
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-neutral-800" />
          <h2 className="font-display text-heading-sm text-neutral-1000">
            Участники ({data.members.length})
          </h2>
        </div>
        <Card>
          <ul className="divide-y divide-neutral-300">
            {data.members.map((m) => {
              const captain = m.team_role === 'captain';
              return (
                <li key={m.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-neutral-1000 truncate">{m.username}</div>
                      <div className="text-xs text-neutral-700 truncate">{m.email}</div>
                    </div>
                  </div>
                  <RoleBadge captain={captain} />
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {modal.kind === 'leave-confirm' && (
        <LeaveConfirmModal
          isLastCaptain={isCaptain && !hasOtherMembers}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={() => void handleLeave()}
          busy={busy}
        />
      )}
      {modal.kind === 'transfer' && (
        <TransferModal
          members={otherMembers}
          afterLeave={modal.afterLeave}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={(id) => void handleTransfer(id, modal.afterLeave)}
          busy={busy}
        />
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-neutral-700 uppercase tracking-wide">{label}</div>
      <div className="font-mono text-xl text-neutral-1000">{value}</div>
    </div>
  );
}

function RoleBadge({ captain }: { captain: boolean }) {
  if (captain) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning-bg text-warning-text border border-warning/40">
        <Crown className="w-3 h-3" />
        Капитан
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-900 border border-neutral-400">
      <ShieldCheck className="w-3 h-3" />
      Участник
    </span>
  );
}

function ModalShell({
  children,
  onBackdrop,
}: {
  children: React.ReactNode;
  onBackdrop?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={onBackdrop}
    >
      <div
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function LeaveConfirmModal({
  isLastCaptain,
  onCancel,
  onConfirm,
  busy,
}: {
  isLastCaptain: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <ModalShell onBackdrop={busy ? undefined : onCancel}>
      <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">
        Покинуть команду?
      </h2>
      {isLastCaptain && (
        <div className="bg-warning-bg border border-warning/40 text-warning-text text-sm rounded-sm px-3 py-2 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Вы последний участник. Команда будет удалена.</span>
        </div>
      )}
      <p className="text-sm text-neutral-800 mb-5">
        Вы потеряете доступ к общим секторам и характеристикам команды.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
        <Button variant="danger" onClick={onConfirm} isLoading={busy}>
          Покинуть
        </Button>
      </div>
    </ModalShell>
  );
}

function TransferModal({
  members,
  afterLeave,
  onCancel,
  onConfirm,
  busy,
}: {
  members: User[];
  afterLeave: boolean;
  onCancel: () => void;
  onConfirm: (newCaptainId: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(members[0]?.id ?? null);

  return (
    <ModalShell onBackdrop={busy ? undefined : onCancel}>
      <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">
        {afterLeave ? 'Передать капитанство перед уходом' : 'Передать капитанство'}
      </h2>
      {afterLeave && (
        <div className="bg-warning-bg border border-warning/40 text-warning-text text-sm rounded-sm px-3 py-2 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Капитан не может покинуть команду, пока в ней есть другие участники.</span>
        </div>
      )}

      <ul className="space-y-1 mb-5 max-h-64 overflow-auto">
        {members.map((m) => (
          <li key={m.id}>
            <label
              className={`flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer border ${
                selected === m.id
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-neutral-400 hover:border-neutral-600'
              }`}
            >
              <input
                type="radio"
                name="new-captain"
                value={m.id}
                checked={selected === m.id}
                onChange={() => setSelected(m.id)}
                disabled={busy}
                className="accent-brand-500"
              />
              <div className="min-w-0">
                <div className="text-neutral-1000 truncate">{m.username}</div>
                <div className="text-xs text-neutral-700 truncate">{m.email}</div>
              </div>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={() => selected && onConfirm(selected)}
          disabled={!selected || busy}
          isLoading={busy}
        >
          {afterLeave ? 'Передать и выйти' : 'Передать'}
        </Button>
      </div>
    </ModalShell>
  );
}
