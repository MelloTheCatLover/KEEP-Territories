-- Swap encounters (16, 20-24) are now bound to a team instead of a hardcoded
-- child name: they trigger when the admin plays as that team (its captain).

ALTER TABLE random_encounters
  ADD COLUMN target_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

UPDATE random_encounters SET title = 'Тайна капитана: Сила ↔ Выносливость'  WHERE number = 16;
UPDATE random_encounters SET title = 'Тайна капитана: Сила ↔ Интеллект'      WHERE number = 20;
UPDATE random_encounters SET title = 'Тайна капитана: Лидерство ↔ Удача'     WHERE number = 21;
UPDATE random_encounters SET title = 'Тайна капитана: Интеллект ↔ Удача'     WHERE number = 22;
UPDATE random_encounters SET title = 'Тайна капитана: Интеллект ↔ Лидерство' WHERE number = 23;
UPDATE random_encounters SET title = 'Тайна капитана: Сила ↔ Удача'          WHERE number = 24;
