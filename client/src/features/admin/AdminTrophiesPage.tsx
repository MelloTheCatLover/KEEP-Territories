import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Crown,
  Gem,
  Sparkles,
  Landmark,
  Star,
  Flame,
  Swords,
  Trophy,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getTrophies } from '../trophies/api';
import type {
  OverallEntry,
  TrophiesResponse,
  TrophyKey,
  TrophyRanking,
} from '../trophies/types';
import { teamPaletteFromColor } from '../../design-system/design-tokens';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TrophiesResponse };

const ICON: Record<TrophyKey, ComponentType<{ className?: string }>> = {
  influential: Crown,
  core_keepers: Gem,
  experienced: Sparkles,
  rulers: Landmark,
  universal: Star,
  unbreakable: Flame,
  conquerors: Swords,
  champions: Trophy,
};

const RULE: Record<TrophyKey, string> = {
  influential:
    'Ранжирование по сумме `influence_reward` захваченных секторов минус drop-штрафы. Ничьи получают одинаковое место (competition rank).',
  core_keepers:
    'Только владелец сектора-ядра — 1 место. Все остальные команды — последнее место (равно числу команд). Если ядро не захвачено — у всех последнее.',
  experienced:
    'Ранжирование по сумме `experience_reward` строк `sector_captures` минус drop-штрафы. Ничьи — competition rank.',
  rulers:
    'Ранжирование по числу секторов с `captured_by_team_id = team`. Считаются и обычные, и home_base.',
  universal:
    'Ранжирование по сумме улучшений характеристик (число строк `team_stat_upgrades` команды).',
  unbreakable:
    'Ранжирование по стрику: число одобренных submission-ов (`capture` / `recapture`) с `reviewed_at` позже последнего drop-штрафа команды. На карте этот показатель скрыт от других команд.',
  conquerors:
    'Ранжирование по числу одобренных submission-ов с `action_type = recapture`. Drop не сбрасывает счётчик. На карте этот показатель скрыт от других команд.',
  champions:
    'Особые события (заглушка). Сейчас у всех 0 — все на последнем месте.',
};

export function AdminTrophiesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getTrophies()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError ? err.message : 'Не удалось загрузить кубки',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">
                Доступ запрещён
              </h1>
              <p className="text-sm text-neutral-700">
                Эта страница доступна только администраторам.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-1000"
      >
        <ArrowLeft className="w-4 h-4" />К админ-панели
      </Link>

      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">
          Кубки
        </h1>
        <p className="text-sm text-neutral-700">
          Места всех команд по каждому кубку и принципы расчёта.
        </p>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          Загрузка...
        </div>
      )}

      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && (
        <>
          <OverallTable overall={state.data.overall} />
          <div className="space-y-4">
            {state.data.trophies.map((trophy) => (
              <TrophyTable key={trophy.key} trophy={trophy} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OverallTable({ overall }: { overall: OverallEntry[] }) {
  if (overall.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-5 h-5 text-brand-400" />
        <h2 className="font-display text-heading-sm text-neutral-1000">
          Общий зачёт
        </h2>
      </div>
      <p className="text-xs text-neutral-700 mb-3 leading-relaxed">
        Сначала по числу выигранных кубков (первых мест), при равенстве — по
        сумме мест команды по всем 8 кубкам (меньше — лучше).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
              <th className="text-left py-2 pr-3 font-medium">Место</th>
              <th className="text-left py-2 pr-3 font-medium">Команда</th>
              <th className="text-right py-2 pr-3 font-medium">Кубков</th>
              <th className="text-right py-2 font-medium">Сумма мест</th>
            </tr>
          </thead>
          <tbody>
            {overall.map((row) => (
              <tr key={row.team_id} className="border-b border-neutral-300">
                <td className="py-2 pr-3 font-mono tabular-nums text-neutral-1000">
                  {row.place}
                </td>
                <td className="py-2 pr-3">
                  <TeamCell name={row.team_name} color={row.team_color} />
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-neutral-1000">
                  {row.trophies_won}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-neutral-1000">
                  {row.sum_of_places}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrophyTable({ trophy }: { trophy: TrophyRanking }) {
  const Icon = ICON[trophy.key];
  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <Icon className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-heading-sm text-neutral-1000">
            {trophy.name}
          </h2>
          <p className="text-xs text-neutral-700 mt-0.5">{trophy.description}</p>
          {trophy.private_value && (
            <p className="text-2xs uppercase tracking-wider text-warning-text mt-1">
              На карте показатель скрыт от чужих команд
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-neutral-700 mb-3 leading-relaxed bg-neutral-100 border border-neutral-300 rounded-sm px-3 py-2">
        {RULE[trophy.key]}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
              <th className="text-left py-2 pr-3 font-medium">Место</th>
              <th className="text-left py-2 pr-3 font-medium">Команда</th>
              <th className="text-right py-2 font-medium">Значение</th>
            </tr>
          </thead>
          <tbody>
            {trophy.entries.map((e) => (
              <tr key={e.team_id} className="border-b border-neutral-300">
                <td className="py-2 pr-3 font-mono tabular-nums text-neutral-1000">
                  {e.place}
                </td>
                <td className="py-2 pr-3">
                  <TeamCell name={e.team_name} color={e.team_color} />
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-neutral-1000">
                  {e.value ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TeamCell({ name, color }: { name: string; color: string | null }) {
  const palette = teamPaletteFromColor(color);
  const fill = palette?.base ?? 'var(--color-neutral-500)';
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: fill }}
      />
      <span className="text-neutral-1000 truncate">{name}</span>
    </span>
  );
}
