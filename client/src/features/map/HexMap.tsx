import { useMemo, useState } from 'react';
import type { Sector, DifficultySlug } from './types';
import { formatSectorLabel } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';
import {
  difficultyColors,
  findTeamColorByHex,
  getTeamColor,
} from '../../design-system/design-tokens';

const HEX_SIZE = 34;
const VIEWBOX_PADDING = 16;
const BADGE_RADIUS = 4;
const FORT_DOT_RADIUS = 2.2;
const FORT_DOT_GAP = 6;

export type TeamInfo = {
  id: string;
  name: string;
  index: number;
  color: string | null;
};

function resolveTeamPalette(team: TeamInfo) {
  return findTeamColorByHex(team.color) ?? getTeamColor(team.index);
}

const DIFFICULTY_BADGE: Record<DifficultySlug, string> = {
  easy: difficultyColors.easy,
  medium: difficultyColors.medium,
  hard: difficultyColors.hard,
  core: difficultyColors.core,
};

type HexMapProps = {
  sectors: Sector[];
  teamsById: Record<string, TeamInfo>;
  onSectorClick?: (sector: Sector) => void;
  highlightIds?: ReadonlySet<string>;
};

type HexStyle = {
  fill: string;
  fillOpacity: number;
  label: string;
  labelFill: string;
  titleExtra: string;
};

function resolveStyle(s: Sector, teamsById: Record<string, TeamInfo>): HexStyle {
  const diffBadge = DIFFICULTY_BADGE[s.difficulty.slug];
  const numberLabel = s.number != null ? formatSectorLabel(s.difficulty.slug, s.number) : '';

  if (s.is_home_base && s.home_team_id) {
    const team = teamsById[s.home_team_id];
    const color = team ? resolveTeamPalette(team) : null;
    return {
      fill: color ? color.bright : diffBadge,
      fillOpacity: 0.9,
      label: 'K',
      labelFill: color ? color.textOnBase : 'var(--color-neutral-0)',
      titleExtra: team ? ` · база ${team.name}` : ' · база',
    };
  }

  if (s.status !== 'free' && s.captured_by_team_id) {
    const team = teamsById[s.captured_by_team_id];
    const color = team ? resolveTeamPalette(team) : null;
    return {
      fill: color ? color.base : diffBadge,
      fillOpacity: 0.85,
      label: numberLabel,
      labelFill: color ? color.textOnBase : 'var(--color-neutral-0)',
      titleExtra: team ? ` · ${team.name}` : '',
    };
  }

  return {
    fill: diffBadge,
    fillOpacity: 0.18,
    label: numberLabel,
    labelFill: 'var(--color-neutral-900)',
    titleExtra: '',
  };
}

export function HexMap({ sectors, teamsById, onSectorClick, highlightIds }: HexMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const orderedSectors = useMemo(() => {
    if (!hoveredId) return sectors;
    const idx = sectors.findIndex((s) => s.id === hoveredId);
    if (idx < 0) return sectors;
    const copy = sectors.slice();
    const [hovered] = copy.splice(idx, 1);
    copy.push(hovered);
    return copy;
  }, [sectors, hoveredId]);

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
      <style>{`
        .hex-cell { cursor: pointer; }
        .hex-fill {
          transform-box: fill-box;
          transform-origin: center;
          transition:
            transform var(--duration-base) var(--ease-out),
            filter var(--duration-base) var(--ease-out),
            stroke var(--duration-base) var(--ease-out),
            stroke-width var(--duration-base) var(--ease-out);
        }
        .hex-cell.is-hovered .hex-fill {
          transform: scale(1.04);
          filter: drop-shadow(0 0 10px rgba(157, 78, 221, 0.55));
          stroke: var(--color-brand-500);
          stroke-width: 2;
        }
        .hex-pulse {
          transform-box: fill-box;
          transform-origin: center;
          animation: hex-pulse 1.8s ease-in-out infinite;
        }
        @keyframes hex-pulse {
          0%, 100% { stroke-opacity: 0.45; transform: scale(1); }
          50%      { stroke-opacity: 1;    transform: scale(1.02); }
        }
      `}</style>

      {/* Grid layer (behind) — thin outlines, no fill. Does not interfere with colors. */}
      <g className="hex-grid" pointerEvents="none">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <polygon
              key={s.id}
              points={hexPoints(x, y, HEX_SIZE)}
              fill="none"
              stroke="var(--color-neutral-500)"
              strokeWidth={1}
            />
          );
        })}
      </g>

      {/* Content layer — hovered rendered last so it's on top of neighbors */}
      <g className="hex-layer">
        {orderedSectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          const badgeColor = DIFFICULTY_BADGE[s.difficulty.slug];
          const badgeX = x - HEX_SIZE * 0.55;
          const badgeY = y - HEX_SIZE * 0.55;
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          const showFort = fortLevel > 0 && s.captured_by_team_id != null;
          const fortY = y + HEX_SIZE * 0.52;
          const fortStartX = x - ((fortLevel - 1) * FORT_DOT_GAP) / 2;
          const isHovered = hoveredId === s.id;

          const highlighted = highlightIds?.has(s.id) ?? false;

          return (
            <g
              key={s.id}
              className={`hex-cell${isHovered ? ' is-hovered' : ''}`}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() =>
                setHoveredId((curr) => (curr === s.id ? null : curr))
              }
              onClick={onSectorClick ? () => onSectorClick(s) : undefined}
            >
              {highlighted && (
                <polygon
                  className="hex-pulse"
                  points={hexPoints(x, y, HEX_SIZE)}
                  fill="none"
                  stroke="var(--color-brand-400)"
                  strokeWidth={3}
                  pointerEvents="none"
                />
              )}
              <polygon
                className="hex-fill"
                points={hexPoints(x, y, HEX_SIZE)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke="none"
              >
                <title>
                  {`${style.label} · ${s.difficulty.name}${style.titleExtra}${
                    showFort ? ` · укр. ${fortLevel}` : ''
                  }`}
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
              {showFort &&
                Array.from({ length: fortLevel }).map((_, i) => (
                  <circle
                    key={i}
                    cx={fortStartX + i * FORT_DOT_GAP}
                    cy={fortY}
                    r={FORT_DOT_RADIUS}
                    fill="var(--color-neutral-1000)"
                    stroke="var(--color-neutral-0)"
                    strokeWidth={0.6}
                    pointerEvents="none"
                  />
                ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
