import { Activity } from 'lucide-react';
import type { TeamFullStats } from '../team/types';
import { findTeamColorByHex, getTeamColor } from '../../design-system/design-tokens';

type SummaryProps = {
  team: TeamFullStats;
  index: number;
  isOwn: boolean;
  pendingCount: number;
  className?: string;
  /** 'grid' = 2 columns (default), 'list' = single column for narrow screens. */
  statsLayout?: 'grid' | 'list';
  /** Team currently leading on leadership — gets a gold frame. */
  isLeadershipLeader?: boolean;
};

const GOLD = '#F5C518';

const STAT_LABELS: Array<[keyof TeamFullStats['stats'], string]> = [
  ['leadership', 'Лидерство'],
  ['strength', 'Сила'],
  ['endurance', 'Выносливость'],
  ['intelligence', 'Интеллект'],
  ['luck', 'Удача'],
];

export function TeamSummaryCard({
  team,
  index,
  isOwn,
  pendingCount,
  className = '',
  statsLayout = 'grid',
  isLeadershipLeader = false,
}: SummaryProps) {
  const palette = findTeamColorByHex(team.color) ?? getTeamColor(index);
  const accent = palette?.base ?? 'var(--color-neutral-500)';
  // Team-coloured frame with a faint wash showing through the dark glass —
  // an accent, not a full recolour. The leadership leader gets a gold frame;
  // own team keeps an extra brand ring.
  const wash = `color-mix(in srgb, ${accent} 16%, transparent)`;

  const shadows: string[] = [];
  if (isLeadershipLeader) {
    shadows.push(`0 0 0 2px ${GOLD}`, `0 0 16px color-mix(in srgb, ${GOLD} 45%, transparent)`);
  }
  if (isOwn) {
    shadows.push(`0 0 0 ${isLeadershipLeader ? 4 : 2}px var(--color-brand-500)`);
  }

  return (
    <div
      className={`relative border rounded-md bg-glass-medium backdrop-blur-glass p-3 sm:p-4 ${className}`}
      style={{
        borderColor: isLeadershipLeader ? GOLD : accent,
        backgroundImage: `linear-gradient(135deg, ${wash}, transparent 70%)`,
        boxShadow: shadows.length ? shadows.join(', ') : undefined,
      }}
    >
      <div className="flex items-center gap-2 min-w-0 pb-3 mb-3 border-b border-neutral-300">
        <span
          aria-hidden
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span className="font-display font-semibold text-lg text-neutral-1000 truncate flex-1 leading-tight">
          {team.name}
        </span>
        {pendingCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-sm font-mono text-warning-text leading-none flex-shrink-0"
            title="Активные действия"
          >
            <Activity className="w-4 h-4" />
            {pendingCount}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <MetricTile label="Влияние" value={team.influence} />
        <MetricTile label="Опыт" value={team.experience} />
        <MetricTile label="Уровень" value={team.level} />
        <MetricTile label="Секторов" value={team.captured_sectors_count} />
      </div>

      <div className="border-t border-neutral-300 pt-3">
        <div className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
          Характеристики
        </div>
        <ul
          className={`grid gap-x-3 gap-y-1.5 ${
            statsLayout === 'list' ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {STAT_LABELS.map(([key, label]) => (
            <li
              key={key}
              className="flex items-baseline justify-between gap-2 min-w-0"
            >
              <span className="text-xs text-neutral-700 truncate">{label}</span>
              <span className="font-mono text-sm text-neutral-1000 tabular-nums flex-shrink-0">
                {team.stats[key]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2 rounded-xs border border-neutral-300 bg-neutral-100/40">
      <span className="text-2xs uppercase tracking-wider text-neutral-700 leading-none">
        {label}
      </span>
      <span className="font-display font-semibold text-xl text-neutral-1000 tabular-nums leading-none">
        {value}
      </span>
    </div>
  );
}
