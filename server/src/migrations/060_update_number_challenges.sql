-- New shift, new squad numbers. Align the two number-based medium groups with
-- the current squads: 36, 97, 98, 26, 74, 37, 07, 62, 85.
--
-- "Рассмешить" already existed (migration 047) with the previous shift's
-- numbers — 13 and 113 are gone, the rest carry over. "Нарисовать номер" is a
-- new group with the same numbers. Each group is a «1 сектор» group: all its
-- tasks live together in one medium sector (bound by the distribution pass).
--
-- FK behavior on the dropped tasks:
--   task_options.task_id     ON DELETE CASCADE   -> auto-cleared
--   task_submissions.task_id ON DELETE SET NULL  -> auto-cleared
--   sector_tasks.task_id     NO ACTION           -> cleared explicitly below

DELETE FROM sector_tasks
WHERE task_id IN (SELECT id FROM tasks WHERE title IN ('Рассмешить 13', 'Рассмешить 113'));

UPDATE sectors SET task_id = NULL
WHERE task_id IN (SELECT id FROM tasks WHERE title IN ('Рассмешить 13', 'Рассмешить 113'));

DELETE FROM tasks WHERE title IN ('Рассмешить 13', 'Рассмешить 113');

DO $body$
DECLARE
  d_medium UUID;
BEGIN
  SELECT id INTO d_medium FROM difficulty_levels WHERE slug = 'medium';

  -- question mirrors title, as in the other camp-challenge seeds.
  INSERT INTO tasks (title, question, difficulty_id)
  SELECT v.t, v.t, d_medium
  FROM (VALUES
    ('Рассмешить 36'),
    ('Рассмешить 97'),
    ('Рассмешить 98'),
    ('Рассмешить 26'),
    ('Рассмешить 74'),
    ('Рассмешить 37'),
    ('Рассмешить 07'),
    ('Рассмешить 62'),
    ('Рассмешить 85'),
    ('Нарисовать номер 36'),
    ('Нарисовать номер 97'),
    ('Нарисовать номер 98'),
    ('Нарисовать номер 26'),
    ('Нарисовать номер 74'),
    ('Нарисовать номер 37'),
    ('Нарисовать номер 07'),
    ('Нарисовать номер 62'),
    ('Нарисовать номер 85')
  ) AS v(t)
  WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.title = v.t);
END $body$;
