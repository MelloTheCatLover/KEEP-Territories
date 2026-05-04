import { Activity } from 'lucide-react';
import type { TeamFullStats } from '../team/types';
import { findTeamColorByHex, getTeamColor } from '../../design-system/design-tokens';

type Props = {
  team: TeamFullStats;
  index: number;
  isOwn: boolean;
  pendingCount: number;
  className?: string;
};

export function TeamMiniCard({ team, index, isOwn, pendingCount, className = '' }: Props) {
  const palette = findTeamColorByHex(team.color) ?? getTeamColor(index);
  const accent = palette?.base ?? 'var(--color-neutral-500)';

  return (
    <div
      className={`relative border rounded-sm bg-glass-medium backdrop-blur-glass p-3 ${
        isOwn ? 'border-brand-500 shadow-[0_0_0_1px_var(--color-brand-500)]' : 'border-neutral-400'
      } ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span
          aria-hidden
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span className="font-display text-sm text-neutral-1000 truncate flex-1">
          {team.name}
        </span>
        {pendingCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-2xs font-mono text-warning-text"
            title="Активные действия"
          >
            <Activity className="w-3 h-3" />
            {pendingCount}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-2xs text-neutral-700">
        <Metric label="ВЛ" value={team.influence} />
        <Metric label="ОП" value={team.experience} />
        <Metric label="Ур" value={team.level} />
        <Metric label="Сек" value={team.captured_sectors_count} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="uppercase tracking-wide text-neutral-700">{label}</span>
      <span className="font-mono text-neutral-1000 tabular-nums truncate">{value}</span>
    </div>
  );
}
