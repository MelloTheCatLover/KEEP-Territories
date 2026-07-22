// How raw stat points translate into gameplay allowances. Kept in one place so
// the server enforces exactly what the client hints at (client mirror lives in
// client/src/features/map/stat-thresholds.ts — keep the two in sync).

/** Сила → пробитие уровней укрепления при перехвате. */
export function penetrationFromStrength(strength: number): number {
  if (strength >= 10) return 3;
  if (strength >= 8) return 2;
  if (strength >= 5) return 1;
  return 0;
}

/** Выносливость → очки передвижения (радиус досягаемости сверх соседнего). */
export function movementFromEndurance(endurance: number): number {
  if (endurance >= 10) return 3;
  if (endurance >= 7) return 2;
  if (endurance >= 4) return 1;
  return 0;
}

/** Интеллект → число проверок (предпросмотров задания) на один захват. */
export function checksFromIntelligence(intelligence: number): number {
  if (intelligence >= 9) return 4;
  if (intelligence >= 7) return 3;
  if (intelligence >= 5) return 2;
  if (intelligence >= 3) return 1;
  return 0;
}

/** Удача → число рероллов (перекрутов задания) на один захват. */
export function rerollsFromLuck(luck: number): number {
  if (luck >= 10) return 3;
  if (luck >= 8) return 2;
  if (luck >= 5) return 1;
  return 0;
}
