import { useState } from 'react';
import type { Sector, DifficultySlug } from './types';
import { formatSectorLabel } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';
import {
  difficultyColors,
  findTeamColorByHex,
  getTeamColor,
} from '../../design-system/design-tokens';

const HEX_SIZE = 34;
const PULSE_INSET = 4;
const VIEWBOX_PADDING = 16;

export const MAP_HEX_SIZE = HEX_SIZE;
export const MAP_VIEWBOX_PADDING = VIEWBOX_PADDING;
const BADGE_RADIUS = 4;
const CAPTURE_RING_SCALE = 0.92;
const FORT_SCALES = [0.65, 0.4, 0.2];

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
      fill: color ? color.muted : 'var(--color-neutral-300)',
      fillOpacity: 1,
      label: 'K',
      labelFill: 'var(--color-neutral-1000)',
      titleExtra: team ? ` · база ${team.name}` : ' · база',
    };
  }

  if (s.status !== 'free' && s.captured_by_team_id) {
    const team = teamsById[s.captured_by_team_id];
    const color = team ? resolveTeamPalette(team) : null;
    return {
      fill: color ? color.bright : diffBadge,
      fillOpacity: 1,
      label: numberLabel,
      labelFill: color ? color.textOnBase : 'var(--color-neutral-0)',
      titleExtra: team ? ` · ${team.name}` : '',
    };
  }

  return {
    fill: 'var(--color-neutral-200)',
    fillOpacity: 1,
    label: numberLabel,
    labelFill: 'var(--color-neutral-800)',
    titleExtra: '',
  };
}

export function HexMap({ sectors, teamsById, onSectorClick, highlightIds }: HexMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
    >
      {/* 1) Outline grid */}
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

      {/* 2) Sector fill + difficulty badge */}
      <g className="hex-fill-layer" pointerEvents="none">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          const badgeColor = DIFFICULTY_BADGE[s.difficulty.slug];
          const badgeX = x - HEX_SIZE * 0.55;
          const badgeY = y - HEX_SIZE * 0.55;
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          const fortInTitle = fortLevel > 0 && s.captured_by_team_id != null;
          return (
            <g key={s.id}>
              <polygon
                points={hexPoints(x, y, HEX_SIZE)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke="var(--color-neutral-50)"
                strokeWidth={0.8}
                strokeLinejoin="round"
              >
                <title>
                  {`${style.label} · ${s.difficulty.name}${style.titleExtra}${
                    fortInTitle ? ` · укр. ${fortLevel}` : ''
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
              />
            </g>
          );
        })}
      </g>

      {/* 3) Fortification nested hexes — only on fully captured sectors */}
      <g className="hex-fort-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (s.status !== 'captured') return null;
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          if (fortLevel === 0) return null;
          const ownerId = s.captured_by_team_id;
          if (!ownerId) return null;
          const team = teamsById[ownerId];
          const palette = team ? resolveTeamPalette(team) : null;
          const fillColor = palette ? palette.dark : 'var(--color-neutral-400)';
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <g key={s.id}>
              {FORT_SCALES.slice(0, fortLevel).map((scale, i) => (
                <polygon
                  key={i}
                  points={hexPoints(x, y, HEX_SIZE * scale)}
                  fill={fillColor}
                  stroke="var(--color-neutral-1000)"
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* 3.5) Sector labels — drawn above fort hexes so the number stays visible */}
      <g className="hex-label-layer" pointerEvents="none">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          if (!style.label) return null;
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          const fortified = fortLevel > 0 && s.status === 'captured' && s.captured_by_team_id != null;
          const labelFill = fortified ? 'var(--color-neutral-1000)' : style.labelFill;
          return (
            <text
              key={s.id}
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize={s.is_home_base ? 14 : 11}
              fontFamily="var(--font-mono)"
              fontWeight={s.is_home_base ? 700 : 400}
              fill={labelFill}
              fillOpacity={0.95}
            >
              {style.label}
            </text>
          );
        })}
      </g>

      {/* 4) Capture rings — sit on top of fortification hexes */}
      <g className="hex-ring-layer" pointerEvents="none">
        {sectors.map((s) => {
          const teamId = s.active_submission_team_id;
          if (!teamId) return null;
          const team = teamsById[teamId];
          const palette = team ? resolveTeamPalette(team) : null;
          const stroke = palette ? palette.bright : 'var(--color-brand-300)';
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <polygon
              key={s.id}
              points={hexPoints(x, y, HEX_SIZE * CAPTURE_RING_SCALE)}
              fill="none"
              stroke={stroke}
              strokeWidth={3.5}
              strokeLinejoin="round"
            />
          );
        })}
      </g>

      {/* 5) Reachability pulse — top-most decorative layer */}
      <g className="hex-pulse-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (!highlightIds?.has(s.id)) return null;
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <polygon
              key={s.id}
              className="hex-pulse"
              points={hexPoints(x, y, HEX_SIZE - PULSE_INSET)}
              fill="none"
              stroke="var(--color-brand-300)"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          );
        })}
      </g>

      {/* Events overlay — captures click/hover; renders hover outline */}
      <g className="hex-events-layer">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const isHovered = hoveredId === s.id;
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
              <polygon
                className="hex-events"
                points={hexPoints(x, y, HEX_SIZE)}
                pointerEvents="all"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
