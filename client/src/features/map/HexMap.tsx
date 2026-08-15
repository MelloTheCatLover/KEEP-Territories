import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Sector, DifficultySlug } from './types';
import { formatSectorLabel } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';
import {
  difficultyColors,
  resolveTeamPalette as resolvePalette,
  specialSectorColor,
} from '../../design-system/design-tokens';

const HEX_SIZE = 34;
const PULSE_INSET = 4;
const VIEWBOX_PADDING = 16;

export const MAP_HEX_SIZE = HEX_SIZE;
export const MAP_VIEWBOX_PADDING = VIEWBOX_PADDING;

// COLOUR BUDGET — the map only ever spends saturated colour on team identity:
// a solid fill means "this team owns it", hatching means "this team is acting
// on it". Everything else is neutral. Difficulty keeps its four hues but is
// demoted to a small chip on a dark plate near the bottom of the hex, so the
// silhouette of every cell is identical and the grid stops flickering.
const DIFF_PLATE_W = HEX_SIZE * 0.60;
const DIFF_PLATE_H = 8.6;
const DIFF_BAR_W = HEX_SIZE * 0.44;
const DIFF_BAR_H = 3.6;
const DIFF_CHIP_CY = HEX_SIZE * 0.50;
// A team with an open submission on a sector hatches it in its own colour.
const HATCH_TILE = 9;
const HATCH_STROKE = 3.4;
// Fortification is drawn as concentric inset outlines ("walls"), one per level,
// so the sector number stays readable — no filled hexes covering the centre.
const FORT_INSETS = [0.80, 0.62, 0.44];

// Pan/zoom: max zoom-in factor relative to the fitted view, and the
// pointer-travel (in px) above which a gesture counts as a drag, not a tap.
const MAX_ZOOM = 4;
const TAP_MOVE_THRESHOLD = 8;

type ViewBox = { x: number; y: number; w: number; h: number };

function clampView(view: ViewBox, base: ViewBox): ViewBox {
  // Don't zoom out past the fitted base, nor in past MAX_ZOOM.
  const minW = base.w / MAX_ZOOM;
  const w = Math.min(base.w, Math.max(minW, view.w));
  const h = w * (base.h / base.w);
  // Keep the view inside the base bounds (no panning the map off-screen).
  const x = Math.min(base.x + base.w - w, Math.max(base.x, view.x));
  const y = Math.min(base.y + base.h - h, Math.max(base.y, view.y));
  return { x, y, w, h };
}

export type TeamInfo = {
  id: string;
  name: string;
  index: number;
  color: string | null;
};

function resolveTeamPalette(team: TeamInfo) {
  return resolvePalette(team.color, team.index);
}

const DIFFICULTY_BADGE: Record<DifficultySlug, string> = {
  easy: difficultyColors.easy,
  medium: difficultyColors.medium,
  hard: difficultyColors.hard,
  core: difficultyColors.core,
};

export type MerchantKind = 'master' | 'saboteur' | 'trader';
export type MerchantMarker = { q: number; r: number; kind: MerchantKind; spent: boolean };

/** Admin merchant overlay: a coloured letter badge per merchant kind. */
export const MERCHANT_MARK: Record<MerchantKind, { letter: string; color: string; label: string }> = {
  master: { letter: 'М', color: '#8B5CF6', label: 'Мастер' },
  saboteur: { letter: 'Д', color: '#EF4444', label: 'Диверсант' },
  trader: { letter: 'Т', color: '#22C55E', label: 'Торговец' },
};

/**
 * Difficulty chip — a coloured bar on a dark plate, low in the hex. The plate
 * is what makes this work: the difficulty hue always sits on the same dark
 * ground, so it reads identically over a dark free cell and over a bright team
 * fill of a near-identical hue (mint on emerald, gold on gold).
 */
function DifficultyChip({ x, y, slug }: { x: number; y: number; slug: DifficultySlug }) {
  const cy = y + DIFF_CHIP_CY;
  return (
    <g>
      <rect
        x={x - DIFF_PLATE_W / 2}
        y={cy - DIFF_PLATE_H / 2}
        width={DIFF_PLATE_W}
        height={DIFF_PLATE_H}
        rx={DIFF_PLATE_H / 2}
        fill="var(--color-neutral-0)"
        fillOpacity={0.82}
      />
      <rect
        x={x - DIFF_BAR_W / 2}
        y={cy - DIFF_BAR_H / 2}
        width={DIFF_BAR_W}
        height={DIFF_BAR_H}
        rx={DIFF_BAR_H / 2}
        fill={DIFFICULTY_BADGE[slug]}
      />
    </g>
  );
}

/** Lucide "trophy" glyph, drawn inline so it scales with the hex geometry. */
function TrophyMark({
  x,
  y,
  size,
  color,
  opacity,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}) {
  const scale = size / 24;
  return (
    <g
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </g>
  );
}

type HexMapProps = {
  sectors: Sector[];
  teamsById: Record<string, TeamInfo>;
  onSectorClick?: (sector: Sector) => void;
  highlightIds?: ReadonlySet<string>;
  /**
   * How loud the highlight is. 'strong' — the team is actually picking a
   * sector right now (creating a base, or waiting on its own submission).
   * 'subtle' — merely "you could reach these", drawn as a dashed outline so a
   * whole reachable frontier doesn't wash the map in brand purple.
   */
  highlightTone?: 'strong' | 'subtle';
  /** Acting team's movement anchor (last captured sector) — marked with a pin. */
  anchorId?: string | null;
  /** Admin merchant overlay — hidden NPC locations, drawn when provided. */
  merchantMarkers?: MerchantMarker[];
  /** Admin filter: when set, sectors NOT in this set are dimmed. */
  filterIds?: ReadonlySet<string> | null;
};

type HexStyle = {
  fill: string;
  fillOpacity: number;
  label: string;
  labelFill: string;
  /** Contrast colour for anything drawn ON the fill (walls, trophy, star). */
  ink: string;
  titleExtra: string;
};

// Ink over a dark cell and over a light (team `bright`) cell. Team fills are
// pastel-light, free cells are near-black, so one flag decides every overlay.
const INK_ON_DARK = 'var(--color-neutral-1000)';
const INK_ON_LIGHT = 'var(--color-neutral-0)';

function resolveStyle(s: Sector, teamsById: Record<string, TeamInfo>): HexStyle {
  const numberLabel = s.number != null ? formatSectorLabel(s.difficulty.slug, s.number) : '';

  // Uncaptured special sector — deep blue with the trophy mark. Once an admin
  // runs the event the 1st place owns it and it paints in that team's colour
  // (handled below); the trophy stays either way.
  if (s.is_special && !s.captured_by_team_id) {
    return {
      fill: specialSectorColor,
      fillOpacity: 1,
      label: '',
      labelFill: INK_ON_DARK,
      ink: INK_ON_DARK,
      titleExtra: ' · особое событие',
    };
  }

  if (s.is_home_base && s.home_team_id) {
    const team = teamsById[s.home_team_id];
    const color = team ? resolveTeamPalette(team) : null;
    return {
      fill: color ? color.muted : 'var(--color-neutral-300)',
      fillOpacity: 1,
      label: 'K',
      labelFill: INK_ON_DARK,
      ink: INK_ON_DARK,
      titleExtra: team ? ` · база ${team.name}` : ' · база',
    };
  }

  if (s.status !== 'free' && s.captured_by_team_id) {
    const team = teamsById[s.captured_by_team_id];
    const color = team ? resolveTeamPalette(team) : null;
    return {
      fill: color ? color.bright : 'var(--color-neutral-300)',
      fillOpacity: 1,
      label: numberLabel,
      labelFill: color ? color.textOnBase : INK_ON_DARK,
      ink: color ? INK_ON_LIGHT : INK_ON_DARK,
      titleExtra: team ? ` · ${team.name}` : '',
    };
  }

  return {
    fill: 'var(--color-neutral-200)',
    fillOpacity: 1,
    label: numberLabel,
    labelFill: 'var(--color-neutral-800)',
    ink: INK_ON_DARK,
    titleExtra: '',
  };
}

export function HexMap({
  sectors,
  teamsById,
  onSectorClick,
  highlightIds,
  highlightTone = 'strong',
  anchorId,
  merchantMarkers,
  filterIds,
}: HexMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const base = useMemo<ViewBox | null>(() => {
    if (sectors.length === 0) return null;
    const { minX, minY, maxX, maxY } = bbox(sectors, HEX_SIZE);
    return {
      x: minX - VIEWBOX_PADDING,
      y: minY - VIEWBOX_PADDING,
      w: maxX - minX + VIEWBOX_PADDING * 2,
      h: maxY - minY + VIEWBOX_PADDING * 2,
    };
  }, [sectors]);

  const [view, setView] = useState<ViewBox | null>(base);
  useEffect(() => {
    // Reset the view whenever the map (and therefore the fitted base) changes.
    setView(base);
  }, [base]);

  // One hatch pattern per distinct acting-team colour. The instance prefix keeps
  // ids unique when several maps share a page (map + admin preview).
  const instanceId = useId().replace(/:/g, '');
  const hatchIds = useMemo(() => {
    const ids = new Map<string, string>();
    for (const s of sectors) {
      const teamId = s.active_submission_team_id;
      if (!teamId) continue;
      const team = teamsById[teamId];
      const color = team ? resolveTeamPalette(team).bright : 'var(--color-brand-300)';
      if (!ids.has(color)) ids.set(color, `hatch-${instanceId}-${ids.size}`);
    }
    return ids;
  }, [sectors, teamsById, instanceId]);

  const containerRef = useRef<HTMLDivElement>(null);
  // Active pointers in client coords, keyed by pointerId.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Snapshot taken when a two-finger pinch begins.
  const pinchRef = useRef<{ dist: number; view: ViewBox } | null>(null);
  // Total pointer travel for the current gesture — used to tell taps from drags.
  const movedRef = useRef(0);
  const draggedRef = useRef(false);

  function rect() {
    return containerRef.current?.getBoundingClientRect() ?? null;
  }

  // True once the user has zoomed past the fitted base view.
  const isZoomed = !!view && !!base && view.w < base.w - 0.5;
  // On touch, a single finger only pans when zoomed in — otherwise the page
  // scrolls normally. Mouse always pans (desktop scrolls with the wheel).
  function canPanWith(pointerType: string) {
    return pointerType === 'mouse' || isZoomed;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (canPanWith(e.pointerType)) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = 0;
    draggedRef.current = false;
    if (pointersRef.current.size === 2 && view) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        view,
      };
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev || !view || !base) return;
    const r = rect();
    if (!r) return;
    const next = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, next);

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      // Pinch: scale the viewBox around the midpoint of the two fingers.
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const start = pinchRef.current;
      const factor = start.dist / dist; // fingers apart -> smaller viewBox -> zoom in
      const midX = (pts[0].x + pts[1].x) / 2 - r.left;
      const midY = (pts[0].y + pts[1].y) / 2 - r.top;
      const ux = start.view.x + (midX / r.width) * start.view.w;
      const uy = start.view.y + (midY / r.height) * start.view.h;
      const w = start.view.w * factor;
      const h = start.view.h * factor;
      movedRef.current += Math.abs(start.dist - dist);
      draggedRef.current = true;
      setView(
        clampView(
          { x: ux - (midX / r.width) * w, y: uy - (midY / r.height) * h, w, h },
          base,
        ),
      );
      return;
    }

    // Single-pointer pan — skipped on touch at base zoom so the page scrolls.
    if (!canPanWith(e.pointerType)) return;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    movedRef.current += Math.hypot(dx, dy);
    if (movedRef.current > TAP_MOVE_THRESHOLD) draggedRef.current = true;
    setView(
      clampView(
        {
          x: view.x - dx * (view.w / r.width),
          y: view.y - dy * (view.h / r.height),
          w: view.w,
          h: view.h,
        },
        base,
      ),
    );
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }

  function handleSectorClick(s: Sector) {
    if (draggedRef.current || !onSectorClick) return;
    onSectorClick(s);
  }

  if (!base || !view) {
    return null;
  }

  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none"
      style={{ touchAction: isZoomed ? 'none' : 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
    <svg
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
    >
      <defs>
        {[...hatchIds].map(([color, id]) => (
          <pattern
            key={id}
            id={id}
            width={HATCH_TILE}
            height={HATCH_TILE}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={HATCH_TILE}
              stroke={color}
              strokeWidth={HATCH_STROKE}
            />
          </pattern>
        ))}
      </defs>

      {/* 1) Sector fill. The hex outline is one neutral tone everywhere — the
          grid is structure, never a signal, so it no longer competes with the
          fills for attention. The gap stroke in the page background keeps
          adjacent same-team cells legible as separate tiles. */}
      <g className="hex-fill-layer" pointerEvents="none">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          const fortInTitle = fortLevel > 0 && s.captured_by_team_id != null;
          return (
            <g key={s.id}>
              <polygon
                points={hexPoints(x, y, HEX_SIZE)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke="var(--color-neutral-0)"
                strokeWidth={1.6}
                strokeLinejoin="round"
              >
                <title>
                  {`${style.label} · ${s.difficulty.name}${style.titleExtra}${
                    fortInTitle ? ` · укр. ${fortLevel}` : ''
                  }`}
                </title>
              </polygon>
              <polygon
                points={hexPoints(x, y, HEX_SIZE - 1)}
                fill="none"
                stroke="var(--color-neutral-400)"
                strokeWidth={1}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </g>

      {/* 2) Special-event mark — a trophy in the centre of every special
          sector, so the event cells stay recognisable after a team paints one
          in its own colour. */}
      <g className="hex-special-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (!s.is_special) return null;
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          return (
            <TrophyMark
              key={s.id}
              x={x}
              y={y - HEX_SIZE * 0.10}
              size={HEX_SIZE * 0.62}
              color={style.ink}
              opacity={0.9}
            />
          );
        })}
      </g>

      {/* 3) Fortification walls — concentric inset outlines on captured
          sectors, one ring per level, drawn in the cell's own ink. No second
          halo stroke: the ink already contrasts with the fill it sits on, and
          the doubled stroke was reading as a thick coloured band. */}
      <g className="hex-fort-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (s.status !== 'captured') return null;
          const fortLevel = Math.max(0, Math.min(3, s.fortification_level | 0));
          if (fortLevel === 0) return null;
          if (!s.captured_by_team_id) return null;
          const style = resolveStyle(s, teamsById);
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <g key={s.id}>
              {FORT_INSETS.slice(0, fortLevel).map((scale, i) => (
                <polygon
                  key={i}
                  points={hexPoints(x, y, HEX_SIZE * scale)}
                  fill="none"
                  stroke={style.ink}
                  strokeOpacity={0.5}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* 4) Sectors under an open submission — hatched in the acting team's
          colour. Hatching reads as "work in progress" without competing with
          the solid fill that marks actual ownership. */}
      <g className="hex-hatch-layer" pointerEvents="none">
        {sectors.map((s) => {
          const teamId = s.active_submission_team_id;
          if (!teamId) return null;
          const team = teamsById[teamId];
          const color = team ? resolveTeamPalette(team).bright : 'var(--color-brand-300)';
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return (
            <polygon
              key={s.id}
              points={hexPoints(x, y, HEX_SIZE - 2)}
              fill={`url(#${hatchIds.get(color)})`}
              stroke="none"
            />
          );
        })}
      </g>

      {/* 5) Difficulty chips — drawn above the fills and the hatching so the
          one thing a team reads before choosing a sector is never obscured.
          Особые события и домашние базы обычным действием не берутся, так что
          сложность там ничего не значит — чип не рисуем. */}
      <g className="hex-difficulty-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (s.is_special || s.is_home_base) return null;
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          return <DifficultyChip key={s.id} x={x} y={y} slug={s.difficulty.slug} />;
        })}
      </g>

      {/* 6) Sector labels — above the walls so the number stays visible. The
          movement anchor rides here as a star in front of the label instead of
          a floating badge of its own. */}
      <g className="hex-label-layer" pointerEvents="none">
        {sectors.map((s) => {
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          const style = resolveStyle(s, teamsById);
          const isAnchor = s.id === anchorId;
          if (!style.label && !isAnchor) return null;
          return (
            <text
              key={s.id}
              x={x}
              y={y - 1}
              textAnchor="middle"
              fontSize={s.is_home_base ? 14 : 11}
              fontFamily="var(--font-mono)"
              fontWeight={s.is_home_base || isAnchor ? 700 : 400}
              fill={style.labelFill}
              fillOpacity={0.95}
            >
              {isAnchor && <tspan fontSize={9}>★ </tspan>}
              {style.label}
            </text>
          );
        })}
      </g>

      {/* 7) Highlight. 'strong' fills the cell — used when the team is picking
          a sector right now. 'subtle' is a dashed outline for the reachable
          frontier: present when you look for it, invisible when you don't. */}
      <g className="hex-pulse-layer" pointerEvents="none">
        {sectors.map((s) => {
          if (!highlightIds?.has(s.id)) return null;
          const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
          if (highlightTone === 'subtle') {
            return (
              <polygon
                key={s.id}
                points={hexPoints(x, y, HEX_SIZE - 2)}
                fill="none"
                stroke="var(--color-brand-200)"
                strokeOpacity={0.55}
                strokeWidth={1.6}
                strokeDasharray="5 4"
                strokeLinejoin="round"
              />
            );
          }
          return (
            <g key={s.id}>
              <polygon
                points={hexPoints(x, y, HEX_SIZE - 1)}
                fill="var(--color-brand-400)"
                fillOpacity={0.28}
                stroke="none"
              />
              <polygon
                className="hex-pulse"
                points={hexPoints(x, y, HEX_SIZE - PULSE_INSET)}
                fill="none"
                stroke="var(--color-brand-200)"
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </g>

      {/* Admin filter dim — sectors outside the active filter fade back */}
      {filterIds && (
        <g className="hex-dim-layer" pointerEvents="none">
          {sectors.map((s) => {
            if (filterIds.has(s.id)) return null;
            const { x, y } = axialToPixel(s.q, s.r, HEX_SIZE);
            return (
              <polygon
                key={s.id}
                points={hexPoints(x, y, HEX_SIZE)}
                fill="var(--color-neutral-50)"
                fillOpacity={0.72}
                stroke="none"
              />
            );
          })}
        </g>
      )}

      {/* Admin merchant overlay — hidden NPC locations */}
      {merchantMarkers && merchantMarkers.length > 0 && (
        <g className="hex-merchant-layer" pointerEvents="none">
          {merchantMarkers.map((m) => {
            const { x, y } = axialToPixel(m.q, m.r, HEX_SIZE);
            const mark = MERCHANT_MARK[m.kind];
            // Top of the hex — the bottom belongs to the difficulty chip.
            const cy = y - HEX_SIZE * 0.46;
            return (
              <g key={`${m.q}:${m.r}`} opacity={m.spent ? 0.45 : 1}>
                <circle
                  cx={x}
                  cy={cy}
                  r={HEX_SIZE * 0.26}
                  fill={mark.color}
                  stroke="var(--color-neutral-0)"
                  strokeWidth={1.5}
                />
                <text
                  x={x}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#fff"
                >
                  {mark.letter}
                </text>
              </g>
            );
          })}
        </g>
      )}

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
              onClick={onSectorClick ? () => handleSectorClick(s) : undefined}
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
    </div>
  );
}
