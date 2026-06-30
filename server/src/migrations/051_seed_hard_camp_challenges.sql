-- Seed the HARD ("Сложные") camp challenges.
-- Unlike easy/medium (a random subset per sector), all hard sectors share ONE
-- common wheel: every hard task is bound to every hard sector, so the pool is
-- identical everywhere. "Выучить папку" is intentionally repeated 8 times to
-- weight the wheel toward it. question mirrors title.

DO $body$
DECLARE
  d_hard UUID;
BEGIN
  SELECT id INTO d_hard FROM difficulty_levels WHERE slug = 'hard';

  INSERT INTO tasks (title, question, difficulty_id)
  SELECT t, t, d_hard
  FROM (VALUES
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Выучить папку'),
    ('Написать описание смены'),
    ('образ смены весь день'),
    ('везде вовремя'),
    ('Человек из команды должен получить карточку'),
    ('Помыться всей командой'),
    ('Крутой профессиональный лайв рилс'),
    ('Участвовать во всем'),
    ('Человек дня')
  ) AS v(t);
END $body$;

-- One common wheel: bind every hard task to every hard sector.
INSERT INTO sector_tasks (sector_id, task_id)
SELECT s.id, t.id
  FROM sectors s
  JOIN difficulty_levels dl ON dl.id = s.difficulty_id
  JOIN tasks t ON t.difficulty_id = s.difficulty_id
 WHERE dl.slug = 'hard'
ON CONFLICT (sector_id, task_id) DO NOTHING;
