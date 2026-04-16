import type { Axial } from './types';

export const AXIAL_NEIGHBORS: readonly Axial[] = [
  { q: +1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: +1 },
  { q: 0, r: -1 },
  { q: +1, r: -1 },
  { q: -1, r: +1 },
];

export function neighbors(q: number, r: number): Axial[] {
  return AXIAL_NEIGHBORS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

export function hexCorners(cx: number, cy: number, size: number): Array<{ x: number; y: number }> {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: cx + size * Math.cos(angleRad),
      y: cy + size * Math.sin(angleRad),
    });
  }
  return corners;
}

export function hexPoints(cx: number, cy: number, size: number): string {
  return hexCorners(cx, cy, size)
    .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(' ');
}

export function ring(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

export function bbox(
  coords: ReadonlyArray<Axial>,
  size: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (coords.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { q, r } of coords) {
    const { x, y } = axialToPixel(q, r, size);
    if (x - size < minX) minX = x - size;
    if (y - size < minY) minY = y - size;
    if (x + size > maxX) maxX = x + size;
    if (y + size > maxY) maxY = y + size;
  }
  return { minX, minY, maxX, maxY };
}
