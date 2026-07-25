-- Восстановление влияния после землетрясения ("Землетрясение").
--
-- Раньше землетрясение переносило сектор к новой команде и ставило no_reward,
-- поэтому получатель влияния не набирал (верно), но ПРЕЖНИЙ владелец терял
-- влияние этого сектора — суммарное влияние падало. Землетрясение должно
-- менять только цвет секторов и кубок "Правители" (кол-во захваченных),
-- влияние трогать нельзя.
--
-- Возвращаем потерю: каждый сектор с no_reward = true не был легитимно
-- (пере)захвачен после землетрясения (легитимный захват снимает no_reward и
-- пишет строку в sector_captures), значит его последняя запись в
-- sector_captures — это команда, которая заработала сектор и потеряла влияние.
-- Кредитуем эту команду ровно на влияние сектора через team_adjustments.
--
-- На чистой БД секторов no_reward = true нет — миграция пустая (no-op).
WITH quake_sectors AS (
  SELECT s.id AS sector_id,
         s.difficulty_id,
         s.reward_multiplier,
         (SELECT sc.team_id
            FROM sector_captures sc
           WHERE sc.sector_id = s.id
           ORDER BY sc.captured_at DESC, sc.id DESC
           LIMIT 1) AS owner_team_id
    FROM sectors s
   WHERE s.no_reward = true
     AND s.is_special = false
),
per_team AS (
  SELECT qs.owner_team_id AS team_id,
         ROUND(SUM(dl.influence_reward * qs.reward_multiplier))::int AS lost
    FROM quake_sectors qs
    JOIN difficulty_levels dl ON dl.id = qs.difficulty_id
   WHERE qs.owner_team_id IS NOT NULL
   GROUP BY qs.owner_team_id
)
INSERT INTO team_adjustments (team_id, influence_delta, experience_delta, upgrade_points_delta, updated_at)
SELECT team_id, lost, 0, 0, NOW()
  FROM per_team
 WHERE lost <> 0
ON CONFLICT (team_id) DO UPDATE SET
  influence_delta = team_adjustments.influence_delta + EXCLUDED.influence_delta,
  updated_at = NOW();
