import type { Sector } from './types';
import { axialToPixel, hexPoints, bbox } from './hex-utils';

const HEX_SIZE = 34;
const VIEWBOX_PADDING = 16;

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
          return (
            <polygon
              key={s.id}
              points={hexPoints(x, y, HEX_SIZE)}
              fill="var(--color-neutral-300)"
              stroke="var(--color-neutral-500)"
              strokeWidth={1}
            />
          );
        })}
      </g>
    </svg>
  );
}
