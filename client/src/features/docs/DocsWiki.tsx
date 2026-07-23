import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BookOpen,
  Swords,
  Sparkles,
  Store,
  Scale,
  Trophy,
  Target,
  ListTree,
} from 'lucide-react';
import { axialToPixel, hexPoints, ring } from '../map/hex-utils';
import { hexDistance } from '../map/stat-thresholds';
import { difficultyColors, specialSectorColor } from '../../design-system/design-tokens';

type NavItem = { to: string; label: string; Icon: typeof BookOpen };

const NAV: NavItem[] = [
  { to: 'overview', label: 'Обзор', Icon: BookOpen },
  { to: 'turn', label: 'Ход игры', Icon: Swords },
  { to: 'stats', label: 'Характеристики', Icon: Sparkles },
  { to: 'characters', label: 'Персонажи', Icon: Store },
  { to: 'congress', label: 'Съезды и законы', Icon: Scale },
  { to: 'cups', label: 'Кубки', Icon: Trophy },
  { to: 'strategies', label: 'Стратегии', Icon: Target },
  { to: 'glossary', label: 'Глоссарий', Icon: ListTree },
];

/** Wiki shell: a section rail on the left, the active section in the outlet. */
export function DocsWiki() {
  return (
    <div className="max-w-5xl mx-auto px-4 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-6 h-6 text-brand-400" />
        <h1 className="font-display text-heading-md text-neutral-1000">База знаний КТП</h1>
      </div>

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <nav className="mb-6 lg:mb-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:sticky lg:top-20 pb-2 lg:pb-0">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-900/30 text-brand-400'
                      : 'text-neutral-700 hover:text-neutral-1000 hover:bg-neutral-200'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/* ── Reusable content primitives (shared by section pages) ────────────────── */

export function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-heading-sm text-neutral-1000 mb-2">{title}</h2>
      {intro && <p className="text-sm text-neutral-700 mb-4">{intro}</p>}
      {children}
    </section>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-display text-base text-brand-400 mt-6 mb-2">{children}</h3>;
}

export function TermList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="space-y-2">
      {items.map(([term, def]) => (
        <div key={term} className="sm:flex sm:gap-3">
          <dt className="font-medium text-neutral-1000 text-sm sm:w-44 sm:flex-shrink-0">{term}</dt>
          <dd className="text-sm text-neutral-700">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ThresholdTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: Array<[string, string]>;
}) {
  return (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm border border-neutral-300 rounded-sm">
        <thead>
          <tr className="bg-neutral-200">
            {head.map((h) => (
              <th key={h} className="text-left font-medium text-neutral-800 px-3 py-1.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t border-neutral-300">
              <td className="px-3 py-1.5 text-neutral-700 whitespace-nowrap">{a}</td>
              <td className="px-3 py-1.5 font-mono text-neutral-1000">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'bg-warning-bg border-warning text-warning-text'
      : 'bg-info-bg border-info/40 text-info-text';
  return (
    <div className={`text-sm border rounded-sm px-3 py-2 ${cls}`}>{children}</div>
  );
}

/** A left-to-right chain of steps (wraps on mobile). */
export function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="inline-block px-2.5 py-1 rounded-sm bg-neutral-100 border border-neutral-300 text-xs text-neutral-1000">
            {s}
          </span>
          {i < steps.length - 1 && <span className="text-neutral-500">→</span>}
        </span>
      ))}
    </div>
  );
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function InfoCard({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="border border-neutral-300 rounded-md p-4 bg-neutral-100">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <div className="font-display text-base text-neutral-1000">{title}</div>
      </div>
      <div className="text-sm text-neutral-700">{children}</div>
    </div>
  );
}

/**
 * Hex reachability scheme: the ★ anchor at centre, rings tinted by distance so
 * the "радиус = очки передвижения" rule is visible at a glance.
 */
export function HexReachDiagram() {
  const SIZE = 16;
  const coords: Array<{ q: number; r: number; d: number }> = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      const d = hexDistance(0, 0, q, r);
      if (d <= 3) coords.push({ q, r, d });
    }
  }
  const pts = coords.map((c) => ({ ...c, ...axialToPixel(c.q, c.r, SIZE) }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = SIZE + 4;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  const ringFill = ['var(--color-brand-500)', 'rgba(34,197,94,.30)', 'rgba(245,158,11,.28)', 'rgba(239,68,68,.22)'];
  const ringStroke = ['var(--color-brand-500)', 'rgb(34,197,94)', 'rgb(245,158,11)', 'rgb(239,68,68)'];

  return (
    <div className="border border-neutral-300 rounded-md p-4 bg-neutral-100">
      <svg
        viewBox={`${minX} ${minY} ${w} ${h}`}
        className="w-full max-w-xs mx-auto block"
        role="img"
        aria-label="Схема дальности передвижения"
      >
        {pts.map((p) => (
          <polygon
            key={`${p.q}:${p.r}`}
            points={hexPoints(p.x, p.y, SIZE - 1.5)}
            fill={ringFill[p.d]}
            stroke={ringStroke[p.d]}
            strokeWidth={1}
          />
        ))}
        <text x={0} y={5} textAnchor="middle" fontSize={16} fill="var(--color-neutral-0)">
          ★
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-neutral-700">
        <LegendDot color="var(--color-brand-500)" label="★ последний захват" />
        <LegendDot color="rgb(34,197,94)" label="дальность 1" />
        <LegendDot color="rgb(245,158,11)" label="дальность 2" />
        <LegendDot color="rgb(239,68,68)" label="дальность 3" />
      </div>
      <p className="text-2xs text-neutral-600 text-center mt-2">
        Очки передвижения = число шагов от последнего захвата (★): шаг на
        соседний сектор — −1 очко. Схема показывает принцип; при выносливости
        10 очков передвижения 9 — до 9 шагов (см. таблицу).
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/**
 * Map layout scheme: concentric difficulty rings from the core outward, using
 * the same tier colours as the real board. A few medium-ring cells are marked
 * "special" and the outer easy ring carries the home bases.
 */
export function MapRingsDiagram() {
  const SIZE = 15;
  // Tier by distance from centre: 0 core, 1 hard, 2 medium, 3 easy.
  const tierColor = [
    difficultyColors.core,
    difficultyColors.hard,
    difficultyColors.medium,
    difficultyColors.easy,
  ];
  // Deterministic accents: a couple of special sectors on the medium ring and
  // home bases spread around the outer easy ring.
  const specials = new Set(['2:-3', '-1:3']);
  const bases = new Set(['3:-3', '-3:0', '0:3', '3:0', '-3:3', '0:-3']);

  const cells: Array<{ q: number; r: number }> = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (hexDistance(0, 0, q, r) <= 3) cells.push({ q, r });
    }
  }
  const pts = cells.map((c) => ({ ...c, ...axialToPixel(c.q, c.r, SIZE) }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = SIZE + 4;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  return (
    <div className="border border-neutral-300 rounded-md p-4 bg-neutral-100">
      <svg
        viewBox={`${minX} ${minY} ${w} ${h}`}
        className="w-full max-w-sm mx-auto block"
        role="img"
        aria-label="Схема колец сложности карты"
      >
        {pts.map((p) => {
          const key = `${p.q}:${p.r}`;
          const isBase = bases.has(key);
          const isSpecial = specials.has(key);
          const fill = isSpecial ? specialSectorColor : tierColor[ring(p.q, p.r)];
          return (
            <g key={key}>
              <polygon
                points={hexPoints(p.x, p.y, SIZE - 1.5)}
                fill={fill}
                stroke={isBase ? 'var(--color-neutral-1000)' : 'rgba(0,0,0,.25)'}
                strokeWidth={isBase ? 2 : 1}
              />
              {p.q === 0 && p.r === 0 && (
                <text x={0} y={5} textAnchor="middle" fontSize={15} fill="#fff">
                  ★
                </text>
              )}
              {isBase && (
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fill="var(--color-neutral-1000)">
                  ⌂
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-neutral-700">
        <LegendDot color={difficultyColors.core} label="★ ядро" />
        <LegendDot color={difficultyColors.hard} label="hard" />
        <LegendDot color={difficultyColors.medium} label="medium" />
        <LegendDot color={difficultyColors.easy} label="easy" />
        <LegendDot color={specialSectorColor} label="особый" />
        <span className="inline-flex items-center gap-1.5">⌂ домашняя база</span>
      </div>
    </div>
  );
}
