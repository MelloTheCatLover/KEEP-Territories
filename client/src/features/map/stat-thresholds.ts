// Mirror of server/src/services/stat-thresholds.ts. The server enforces these;
// the client uses them only to hint (highlights, disabled actions). Keep in sync.

export function penetrationFromStrength(strength: number): number {
  if (strength >= 10) return 3;
  if (strength >= 8) return 2;
  if (strength >= 5) return 1;
  return 0;
}

export function movementFromEndurance(endurance: number): number {
  if (endurance >= 10) return 9;
  if (endurance >= 7) return 7;
  if (endurance >= 4) return 5;
  if (endurance >= 1) return 3;
  return 0;
}

export function checksFromIntelligence(intelligence: number): number {
  if (intelligence >= 9) return 4;
  if (intelligence >= 7) return 3;
  if (intelligence >= 5) return 2;
  if (intelligence >= 3) return 1;
  return 0;
}

export function rerollsFromLuck(luck: number): number {
  if (luck >= 10) return 3;
  if (luck >= 8) return 2;
  if (luck >= 5) return 1;
  return 0;
}

/** Axial hex distance between two sectors. */
export function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
