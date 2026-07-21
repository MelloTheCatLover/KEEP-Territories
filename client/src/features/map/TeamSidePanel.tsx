import { Activity, Crown } from 'lucide-react';
import type { TeamFullStats } from '../team/types';
import { resolveTeamPalette } from '../../design-system/design-tokens';

type SummaryProps = {
  team: TeamFullStats;
  index: number;
  isOwn: boolean;
  pendingCount: number;
  className?: string;
  /** 'grid' = 2 columns (default), 'list' = single column for narrow screens. */
  statsLayout?: 'grid' | 'list';
  /** Team currently leading on leadership — gets a small crown beside its name. */
  isLeadershipLeader?: boolean;
  /** Admin only: makes the whole card clickable to open team management. */
  onManage?: () => void;
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
  onManage,
}: SummaryProps) {
  const palette = resolveTeamPalette(team.color, index);
  const accent = palette.base;
  // Team-coloured frame with a faint wash showing through the dark glass —
  // an accent, not a full recolour. The leadership leader is marked with a small
  // crown beside its name; own team keeps an extra brand ring.
  const wash = `color-mix(in srgb, ${accent} 16%, transparent)`;

  const shadows: string[] = [];
  if (isOwn) {
    shadows.push('0 0 0 2px var(--color-brand-500)');
  }

  return (
    <div
      className={`relative border rounded-md bg-glass-medium backdrop-blur-glass p-3 sm:p-4 ${
        onManage ? 'cursor-pointer hover:brightness-110 transition-[filter]' : ''
      } ${className}`}
      style={{
        borderColor: accent,
        backgroundImage: `linear-gradient(135deg, ${wash}, transparent 70%)`,
        boxShadow: shadows.length ? shadows.join(', ') : undefined,
      }}
      role={onManage ? 'button' : undefined}
      tabIndex={onManage ? 0 : undefined}
      onClick={onManage}
      onKeyDown={
        onManage
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onManage();
              }
            }
          : undefined
      }
      title={onManage ? 'Управлять командой' : undefined}
    >
      <div className="flex items-center gap-2 min-w-0 pb-3 mb-3 border-b border-neutral-300">
        <span
          aria-hidden
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        {isLeadershipLeader && (
          <Crown
            className="w-4 h-4 flex-shrink-0"
            style={{ color: GOLD, fill: GOLD }}
            aria-label="Лидер по лидерству"
          />
        )}
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

type ProjectorProps = {
  team: TeamFullStats;
  index: number;
  pendingCount: number;
  isLeadershipLeader?: boolean;
};

/** Short stat labels — full words don't fit the projector card's stat row. */
const SHORT_STAT_LABELS: Array<[keyof TeamFullStats['stats'], string, string]> = [
  ['leadership', 'ЛИД', 'Лидерство'],
  ['strength', 'СИЛ', 'Сила'],
  ['endurance', 'ВЫН', 'Выносливость'],
  ['intelligence', 'ИНТ', 'Интеллект'],
  ['luck', 'УДЧ', 'Удача'],
];

const PROJECTOR_METRICS: Array<[keyof TeamFullStats | 'captured', string]> = [
  ['influence', 'Влияние'],
  ['experience', 'Опыт'],
  ['level', 'Уровень'],
  ['captured', 'Секторов'],
];

/**
 * Team card for the projected board. Sizes are fixed px (not responsive): the
 * whole board is drawn on a fixed canvas and scaled to the projector, so the
 * card must never reflow — it only ever gets scaled up or down as a whole.
 */
export function ProjectorTeamCard({
  team,
  index,
  pendingCount,
  isLeadershipLeader = false,
}: ProjectorProps) {
  const palette = resolveTeamPalette(team.color, index);
  const accent = palette.base;
  const wash = `color-mix(in srgb, ${accent} 18%, transparent)`;

  return (
    <div
      className="h-full min-h-0 overflow-hidden flex flex-col justify-center gap-2 border-2 rounded-md bg-glass-medium backdrop-blur-glass px-3 py-2.5"
      style={{
        borderColor: accent,
        backgroundImage: `linear-gradient(135deg, ${wash}, transparent 70%)`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        {isLeadershipLeader && (
          <Crown
            className="w-5 h-5 flex-shrink-0"
            style={{ color: GOLD, fill: GOLD }}
            aria-label="Лидер по лидерству"
          />
        )}
        <span className="font-display font-bold text-[22px] leading-none text-neutral-1000 truncate flex-1">
          {team.name}
        </span>
        {pendingCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[16px] font-mono text-warning-text leading-none flex-shrink-0"
            title="Активные действия"
          >
            <Activity className="w-4 h-4" />
            {pendingCount}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PROJECTOR_METRICS.map(([key, label]) => (
          <div
            key={label}
            className="flex flex-col gap-1 px-1.5 py-1.5 rounded-xs border border-neutral-300 bg-neutral-100/40"
          >
            <span className="text-[10px] uppercase tracking-wider text-neutral-700 leading-none truncate">
              {label}
            </span>
            <span className="font-display font-bold text-[24px] text-neutral-1000 tabular-nums leading-none">
              {key === 'captured' ? team.captured_sectors_count : (team[key] as number)}
            </span>
          </div>
        ))}
      </div>

      <ul className="grid grid-cols-5 gap-1.5">
        {SHORT_STAT_LABELS.map(([key, short, full]) => (
          <li
            key={key}
            title={full}
            className="flex flex-col items-center gap-0.5 py-1 rounded-xs bg-neutral-100/30"
          >
            <span className="text-[10px] uppercase tracking-wider text-neutral-700 leading-none">
              {short}
            </span>
            <span className="font-mono text-[18px] text-neutral-1000 tabular-nums leading-none">
              {team.stats[key]}
            </span>
          </li>
        ))}
      </ul>
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
