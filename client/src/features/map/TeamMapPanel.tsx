import { Package } from 'lucide-react';
import type { TeamFullStats, StatName } from '../team/types';

const STAT_LABEL: Record<StatName, string> = {
  strength: 'Сила',
  intelligence: 'Интеллект',
  endurance: 'Выносливость',
  leadership: 'Лидерство',
  luck: 'Удача',
};

const STAT_ORDER: StatName[] = [
  'strength',
  'intelligence',
  'endurance',
  'leadership',
  'luck',
];

type TeamMapPanelProps = {
  team: TeamFullStats;
};

export function TeamMapPanel({ team }: TeamMapPanelProps) {
  const borderColor = team.color ?? 'var(--color-neutral-400)';

  return (
    <section
      className="rounded-md bg-neutral-100 mb-4 overflow-hidden"
      style={{ border: `2px solid ${borderColor}` }}
      aria-label={`Сводка команды ${team.name}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y divide-neutral-300 lg:divide-y-0 lg:divide-x">
        <Cell label="Команда">
          <div className="font-display text-lg text-neutral-1000 truncate">
            {team.name}
          </div>
          <div className="text-xs text-neutral-700 mt-0.5">
            ур. {team.level} · секторов {team.captured_sectors_count}
          </div>
        </Cell>

        <Cell label="Опыт">
          <div className="font-mono text-xl text-neutral-1000">
            {team.experience}
          </div>
        </Cell>

        <Cell label="Влияние">
          <div className="font-mono text-xl text-neutral-1000">
            {team.influence}
          </div>
        </Cell>

        <Cell label="Характеристики">
          <ul className="grid grid-cols-5 gap-1">
            {STAT_ORDER.map((s) => (
              <li
                key={s}
                className="text-center"
                title={STAT_LABEL[s]}
              >
                <div className="text-[10px] text-neutral-700 uppercase tracking-wide truncate">
                  {STAT_LABEL[s].slice(0, 3)}
                </div>
                <div className="font-mono text-sm text-neutral-1000">
                  {team.stats[s]}
                </div>
              </li>
            ))}
          </ul>
        </Cell>

        <Cell label="Предметы">
          <div className="flex items-center gap-2 text-neutral-700">
            <Package className="w-4 h-4" />
            <span className="text-xs">Скоро</span>
          </div>
        </Cell>
      </div>
    </section>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div className="text-[10px] text-neutral-700 uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
