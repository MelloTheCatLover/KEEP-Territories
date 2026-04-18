import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, ShieldCheck, Users } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getSettings, type GameSetting } from '../admin/settings-api';
import { getTeamStats, upgradeStat } from './api';
import type { StatName, TeamFullStats } from './types';
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

export function TeamPage() {
  const { user } = useAuth();
  const teamId = user?.team_id ?? null;
  const isCaptain = user?.team_role === 'captain';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [upgrading, setUpgrading] = useState<StatName | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <Card>
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-md flex-shrink-0 border border-glass"
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
                  <div className="min-w-0">
                    <div className="font-display text-heading-sm text-neutral-1000">
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
