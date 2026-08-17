-- Слои краски: закрашенное чужое граффити не пропадает, а уходит под верхний
-- слой и возвращается, когда верхний смывают.
--
-- Раньше закраска поверх чужого закрывала прежнюю запись ('consumed'), и
-- сектор было уже не вернуть в состояние до последней покраски: смыв всегда
-- давал чистую клетку. Теперь перекрытая запись получает статус 'covered' —
-- она жива, просто не видна: `sectors.graffiti_team_id` носит цвет верхнего
-- слоя, а `team_law_effects` держит стопку под ним (по одному слою на
-- команду — своя прежняя краска при перекраске закрывается).
--
-- Смыв верхнего слоя поднимает последний 'covered' обратно в 'armed' и
-- возвращает сектору его цвет. Захват сектора сносит всю стопку целиком:
-- захваченная клетка носит цвет владельца.

ALTER TABLE team_law_effects DROP CONSTRAINT team_law_effects_status_check;
ALTER TABLE team_law_effects ADD CONSTRAINT team_law_effects_status_check
  CHECK (status IN ('applied', 'armed', 'covered', 'consumed', 'cancelled'));

-- Горячий путь: «что лежит под краской этого сектора» — спрашивает смыв.
CREATE INDEX idx_team_law_effects_covered
  ON team_law_effects(sector_id, created_at DESC)
  WHERE status = 'covered';
