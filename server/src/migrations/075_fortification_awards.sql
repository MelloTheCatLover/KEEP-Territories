-- Укрепление приносит команде половину награды сектора за каждый уровень.
--
-- Влияние считается из текущего fortification_level захваченных секторов —
-- потерял сектор (захват обнуляет укрепление), потерял и бонус, ровно как с
-- базовым влиянием сектора.
--
-- Опыт, как и опыт за захваты, не сгорает: каждый поднятый уровень пишет
-- строку в журнал ниже. Снятие укрепления и потеря сектора строки не удаляют.
CREATE TABLE sector_fortification_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  awarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fortification_awards_team ON sector_fortification_awards(team_id);
CREATE INDEX idx_fortification_awards_sector ON sector_fortification_awards(sector_id);

-- Разовый бэкфилл: за уже стоящие укрепления опыт выдаём задним числом —
-- по строке на каждый уровень текущего владельца.
INSERT INTO sector_fortification_awards (sector_id, team_id)
SELECT s.id, s.captured_by_team_id
  FROM sectors s
  CROSS JOIN LATERAL generate_series(1, s.fortification_level) AS lvl
 WHERE s.captured_by_team_id IS NOT NULL
   AND s.fortification_level > 0;
