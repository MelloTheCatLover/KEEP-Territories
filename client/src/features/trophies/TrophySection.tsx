import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import {
  Crown,
  Gem,
  Sparkles,
  Landmark,
  Star,
  Flame,
  Swords,
  Trophy,
  Loader2,
} from 'lucide-react';
import { findTeamColorByHex } from '../../design-system/design-tokens';
import { ApiError } from '../../shared/api/client';
import { getTrophies } from './api';
import type {
  TrophyKey,
  TrophyRanking,
  TrophiesResponse,
} from './types';

type Props = {
  /** Bumped by the parent after sector mutations to force a refetch. */
  refreshKey?: number;
};

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TrophiesResponse };

const TROPHY_ICON: Record<TrophyKey, ComponentType<{ className?: string }>> = {
  influential: Crown,
  core_keepers: Gem,
  experienced: Sparkles,
  rulers: Landmark,
  universal: Star,
  unbreakable: Flame,
  conquerors: Swords,
  champions: Trophy,
};

export function TrophySection({ refreshKey = 0 }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getTrophies()
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ready', data });
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
  }, [refreshKey]);

  if (state.status === 'loading') {
    return (
      <section className="mt-6 flex items-center gap-2 text-sm text-neutral-700">
        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
        Загрузка кубков...
      </section>
    );
  }
  if (state.status === 'error') {
    return (
      <section className="mt-6 text-sm text-danger-text">
        {state.message}
      </section>
    );
  }
  const { trophies } = state.data;
  if (trophies.length === 0) return null;

  return (
    <section className="mt-6 space-y-3">
      <h2 className="font-display text-heading-sm text-neutral-1000">Кубки</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {trophies.map((trophy) => (
          <TrophyCard key={trophy.key} trophy={trophy} />
        ))}
      </div>
    </section>
  );
}

function TrophyCard({ trophy }: { trophy: TrophyRanking }) {
  const Icon = TROPHY_ICON[trophy.key];
  const winners = trophy.entries.filter((e) => e.place === 1);
  const colors = winners
    .map((w) => findTeamColorByHex(w.team_color)?.bright ?? null)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const fillStyle = buildFillStyle(colors);

  return (
    <div
      className="relative border border-neutral-400 overflow-hidden h-36 flex items-end"
      style={fillStyle}
      title={trophy.description}
    >
      <div className="relative w-full px-3 py-2 flex items-center gap-2 min-w-0 bg-neutral-0/65 border-t border-neutral-1000/10 backdrop-blur-sm">
        <Icon className="w-4 h-4 text-neutral-1000 flex-shrink-0" />
        <span className="font-display text-sm text-neutral-1000 truncate">
          {trophy.name}
        </span>
      </div>
    </div>
  );
}

function buildFillStyle(colors: string[]): CSSProperties {
  if (colors.length === 0) {
    return { backgroundColor: 'var(--color-neutral-300)' };
  }
  if (colors.length === 1) {
    return { backgroundColor: colors[0] };
  }
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  return { background: `linear-gradient(90deg, ${stops})` };
}
