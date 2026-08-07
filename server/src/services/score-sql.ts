/**
 * Каноничные SQL-выражения для влияния и опыта команды.
 *
 * Формулы читаются из нескольких мест (статы команды, конгресс, кубки,
 * проверка платёжеспособности при телепорте), и разъезд между копиями означает
 * разные цифры в разных экранах — поэтому единственный источник правды здесь.
 *
 * `team` — SQL-выражение с id команды: плейсхолдер (`$1`) или колонка (`t.id`).
 */

/** Половина награды сектора — бонус за каждый уровень укрепления. */
const HALF = (rewardColumn: string) => `FLOOR(${rewardColumn} / 2)`;

/**
 * Влияние: сумма наград удерживаемых секторов плюс половина награды за каждый
 * уровень укрепления на них. Потеря сектора снимает и то, и другое.
 */
export function influenceExpr(team: string): string {
  return `GREATEST(
    0,
    COALESCE((SELECT ROUND(SUM(dl.influence_reward * s.reward_multiplier))
                FROM sectors s
                JOIN difficulty_levels dl ON dl.id = s.difficulty_id
               WHERE s.captured_by_team_id = ${team}
                 AND s.is_special = false AND s.no_reward = false), 0)
    + COALESCE((SELECT SUM(${HALF('dl.influence_reward * s.reward_multiplier')} * s.fortification_level)
                  FROM sectors s
                  JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                 WHERE s.captured_by_team_id = ${team}
                   AND s.is_special = false AND s.no_reward = false), 0)
    + COALESCE((SELECT SUM(influence) FROM special_sector_awards WHERE team_id = ${team}), 0)
    - COALESCE((SELECT SUM(influence) FROM team_penalties WHERE team_id = ${team}), 0)
    + COALESCE((SELECT influence_delta FROM team_adjustments WHERE team_id = ${team}), 0)
  )::int`;
}

/**
 * Опыт: заработанное не сгорает. Считается по журналам захватов и укреплений,
 * а не по текущему владению — потерянный сектор опыт не забирает.
 */
export function experienceExpr(team: string): string {
  return `GREATEST(
    0,
    COALESCE((SELECT ROUND(SUM(dl.experience_reward * s.reward_multiplier))
                FROM sector_captures sc
                JOIN sectors s ON s.id = sc.sector_id
                JOIN difficulty_levels dl ON dl.id = s.difficulty_id
               WHERE sc.team_id = ${team} AND s.is_special = false), 0)
    + COALESCE((SELECT SUM(${HALF('dl.experience_reward * s.reward_multiplier')})
                  FROM sector_fortification_awards fa
                  JOIN sectors s ON s.id = fa.sector_id
                  JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                 WHERE fa.team_id = ${team} AND s.is_special = false), 0)
    + COALESCE((SELECT SUM(experience) FROM special_sector_awards WHERE team_id = ${team}), 0)
    - COALESCE((SELECT SUM(experience) FROM team_penalties WHERE team_id = ${team}), 0)
    + COALESCE((SELECT experience_delta FROM team_adjustments WHERE team_id = ${team}), 0)
  )::int`;
}
