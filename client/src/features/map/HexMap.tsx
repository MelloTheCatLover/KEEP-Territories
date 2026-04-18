import type { Sector, DifficultySlug } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';
import {
  difficultyColors,
  getTeamColor,
} from '../../design-system/design-tokens';

const HEX_SIZE = 34;
const VIEWBOX_PADDING = 16;
const BADGE_RADIUS = 4;

export type TeamInfo = {
  id: string;
  name: string;
  index: number;
};

const DIFFICULTY_BADGE: Record<DifficultySlug, string> = {
  easy: difficultyColors.easy,
  medium: difficultyColors.medium,
  hard: difficultyColors.hard,
  core: difficultyColors.core,
};

type HexMapProps = {
  sectors: Sector[];
  teamsById: Record<string, TeamInfo>;
};

type HexStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  label: string;
  labelFill: string;
  titleExtra: string;
};

function resolveStyle(s: Sector, teamsById: Record<string, TeamInfo>): HexStyle {
  const diffBadge = DIFFICULTY_BADGE[s.difficulty.slug];

  if (s.is_home_base && s.home_team_id) {
    const team = teamsById[s.home_team_id];
    const color = team ? getTeamColor(team.index) : null;
    return {
      fill: color ? color.bright : diffBadge,
      fillOpacity: 0.9,
      stroke: color ? color.bright : 'var(--color-brand-400)',
      strokeWidth: 3,
      label: 'K',
      labelFill: color ? color.textOnBase : 'var(--color-neutral-0)',
      titleExtra: team ? ` · база ${team.name}` : ' · база',
    };
  }

  if (s.status !== 'free' && s.captured_by_team_id) {
    const team = teamsById[s.captured_by_team_id];
    const color = team ? getTeamColor(team.index) : null;
    return {
      fill: color ? color.base : diffBadge,
      fillOpacity: 0.8,
      stroke: color ? color.muted : 'var(--color-neutral-500)',
      strokeWidth: 1.5,
      label: String(s.number),
      labelFill: color ? color.textOnBase : 'var(--color-neutral-0)',
      titleExtra: team ? ` · ${team.name}` : '',
    };
  }

  return {
    fill: diffBadge,
    fillOpacity: 0.18,
    stroke: 'var(--color-neutral-500)',
    strokeWidth: 1,
    label: String(s.number),
    labelFill: 'var(--color-neutral-900)',
    titleExtra: '',
  };
}

export function HexMap({ sectors, teamsById }: HexMapProps) {
  if (sectors.length === 0) {
    return null;
  }

  const { minX, minY, maxX, maxY } = bbox(sectors, HEX_SIZE);
  const width = maxX - minX + VIEWBOX_PADDING * 2;
  const height = maxY - minY + VIEWBOX_PADDING * 2;
  const viewBox = `${minX - VIEWBOX_PADDING} ${minY - VIEWBOX_PADDING} ${width} ${height}`;

  return (
    <svg
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{ maxHeight: '80vh' }}
    >
      <g>
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          const badgeColor = DIFFICULTY_BADGE[s.difficulty.slug];
          const badgeX = x - HEX_SIZE * 0.55;
          const badgeY = y - HEX_SIZE * 0.55;

          return (
            <g key={s.id}>
              <polygon
                points={hexPoints(x, y, HEX_SIZE)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
              >
                <title>
                  {`#${s.number} · ${s.difficulty.name}${style.titleExtra}`}
                </title>
              </polygon>
              <circle
                cx={badgeX}
                cy={badgeY}
                r={BADGE_RADIUS}
                fill={badgeColor}
                stroke="var(--color-neutral-0)"
                strokeWidth={0.8}
                pointerEvents="none"
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={s.is_home_base ? 14 : 11}
                fontFamily="var(--font-mono)"
                fontWeight={s.is_home_base ? 700 : 400}
                fill={style.labelFill}
                fillOpacity={0.9}
                pointerEvents="none"
              >
                {style.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
