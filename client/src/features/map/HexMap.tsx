import type { Sector, DifficultySlug } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';

const HEX_SIZE = 34;
const VIEWBOX_PADDING = 16;

const DIFFICULTY_FILL: Record<DifficultySlug, string> = {
  easy: 'var(--difficulty-easy)',
  medium: 'var(--difficulty-medium)',
  hard: 'var(--difficulty-hard)',
  core: 'var(--difficulty-core)',
};

type HexMapProps = {
  sectors: Sector[];
};

export function HexMap({ sectors }: HexMapProps) {
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
          const fill = DIFFICULTY_FILL[s.difficulty.slug];
          const stroke = s.is_home_base
            ? 'var(--color-brand-400)'
            : 'var(--color-neutral-500)';
          const strokeWidth = s.is_home_base ? 3 : 1;
          return (
            <g key={s.id}>
              <polygon
                points={hexPoints(x, y, HEX_SIZE)}
                fill={fill}
                fillOpacity={0.75}
                stroke={stroke}
                strokeWidth={strokeWidth}
              >
                <title>
                  {`#${s.number} · ${s.difficulty.name}${s.is_home_base ? ' · база' : ''}`}
                </title>
              </polygon>
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="var(--color-neutral-0)"
                fillOpacity={0.8}
                pointerEvents="none"
              >
                {s.number}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
