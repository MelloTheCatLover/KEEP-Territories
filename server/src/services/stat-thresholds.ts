// How raw stat points translate into gameplay allowances. Kept in one place so
// the server enforces exactly what the client hints at (client mirror lives in
// client/src/features/map/stat-thresholds.ts — keep the two in sync).

import { StatName } from '../types/team-stats';

/** Сила → пробитие уровней укрепления при перезахвате. */
export function penetrationFromStrength(strength: number): number {
  if (strength >= 10) return 3;
  if (strength >= 8) return 2;
  if (strength >= 5) return 1;
  return 0;
}

/** Выносливость → очки передвижения (радиус досягаемости сверх соседнего). */
export function movementFromEndurance(endurance: number): number {
  if (endurance >= 10) return 9;
  if (endurance >= 7) return 7;
  if (endurance >= 4) return 5;
  if (endurance >= 1) return 3;
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

/**
 * Лестницы порогов для кубка «Универсальные».
 *
 * Кубок ранжирует не сумму характеристик (она пропорциональна опыту и потому
 * дублировала кубок «Опытные»), а число реально открытых игровых порогов. Вложить
 * 10 очков в одну статy — 3 порога; разложить те же 10 по пяти — до 5-7 порогов.
 *
 * Числа для силы/выносливости/интеллекта/удачи — ровно те, что читают функции
 * выше. У лидерства механических порогов нет: оно работает как значение проверки
 * в случайных встречах, поэтому его лестница — набор сложностей leadership-
 * проверок из encounter-catalog (4/5/6/7).
 */
export const TROPHY_STAT_LADDERS: Record<StatName, readonly number[]> = {
  strength: [5, 8, 10],
  endurance: [1, 4, 7, 10],
  intelligence: [3, 5, 7, 9],
  luck: [5, 8, 10],
  leadership: [4, 5, 6, 7],
};

/** Максимум порогов, доступных команде — знаменатель для «Универсальных». */
export const TROPHY_LADDER_TOTAL = Object.values(TROPHY_STAT_LADDERS).reduce(
  (sum, rungs) => sum + rungs.length,
  0,
);

/** Сколько порогов открыто одной характеристикой при данном значении. */
export function rungsUnlocked(stat: StatName, value: number): number {
  return TROPHY_STAT_LADDERS[stat].filter((rung) => value >= rung).length;
}

/** Метрика кубка «Универсальные»: сумма открытых порогов по всем статам. */
export function thresholdCoverage(stats: Record<StatName, number>): number {
  return (Object.keys(TROPHY_STAT_LADDERS) as StatName[]).reduce(
    (sum, stat) => sum + rungsUnlocked(stat, stats[stat] ?? 0),
    0,
  );
}
