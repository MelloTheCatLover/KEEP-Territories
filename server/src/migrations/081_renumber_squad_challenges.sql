-- Новая смена — новые отряды: 09, 16, 34, 36, 78, 91, 114.
--
-- Номерные семейства «Рисунок», «Нарисовать номер», «Рисунок ЦВЕТ» и
-- «5 годных рислов» переводятся ровно на этот набор: по одному заданию на
-- отряд. Переименование идёт в существующих записях (а не delete + insert),
-- поэтому привязки к секторам (`sector_tasks`) переживают смену номеров.
--
-- Порядок для каждого семейства:
--   1) попарное переименование: i-е задание по возрастанию старого номера
--      получает i-й новый номер;
--   2) лишние (старых номеров было больше семи) удаляются вместе с привязками;
--   3) недостающие досоздаются — они остаются без сектора, привязать их можно
--      кнопкой «Перетасовать задания» на /admin/map.
--
-- `question = title` (испытание самоописательно), поэтому правим оба поля.
--
-- FK: task_options.task_id ON DELETE CASCADE, task_submissions.task_id
-- ON DELETE SET NULL — чистятся сами; sector_tasks.task_id NO ACTION и
-- sectors.task_id — чистим руками.

-- Новые номера в порядке возрастания: позиция = кому какой номер достанется.
CREATE TEMP TABLE squad_numbers (rn INT PRIMARY KEY, num TEXT) ON COMMIT DROP;
INSERT INTO squad_numbers (rn, num) VALUES
  (1, '09'), (2, '16'), (3, '34'), (4, '36'), (5, '78'), (6, '91'), (7, '114');

/* ── 1) Переименование ────────────────────────────────────────────────────── */

WITH existing AS (
  SELECT t.id,
         row_number() OVER (ORDER BY (substring(t.title from '[0-9]+$'))::int) AS rn
    FROM tasks t
    JOIN difficulty_levels dl ON dl.id = t.difficulty_id
   WHERE dl.slug = 'easy' AND t.title ~ '^Рисунок [0-9]+$'
)
UPDATE tasks t
   SET title = 'Рисунок ' || s.num,
       question = 'Рисунок ' || s.num,
       updated_at = NOW()
  FROM existing
  JOIN squad_numbers s ON s.rn = existing.rn
 WHERE t.id = existing.id;

WITH existing AS (
  SELECT t.id,
         row_number() OVER (ORDER BY (substring(t.title from '[0-9]+$'))::int) AS rn
    FROM tasks t
    JOIN difficulty_levels dl ON dl.id = t.difficulty_id
   WHERE dl.slug = 'medium' AND t.title ~ '^Нарисовать номер [0-9]+$'
)
UPDATE tasks t
   SET title = 'Нарисовать номер ' || s.num,
       question = 'Нарисовать номер ' || s.num,
       updated_at = NOW()
  FROM existing
  JOIN squad_numbers s ON s.rn = existing.rn
 WHERE t.id = existing.id;

WITH existing AS (
  SELECT t.id,
         row_number() OVER (ORDER BY (substring(t.title from '[0-9]+$'))::int) AS rn
    FROM tasks t
    JOIN difficulty_levels dl ON dl.id = t.difficulty_id
   WHERE dl.slug = 'medium' AND t.title ~ '^Рисунок ЦВЕТ [0-9]+$'
)
UPDATE tasks t
   SET title = 'Рисунок ЦВЕТ ' || s.num,
       question = 'Рисунок ЦВЕТ ' || s.num,
       updated_at = NOW()
  FROM existing
  JOIN squad_numbers s ON s.rn = existing.rn
 WHERE t.id = existing.id;

WITH existing AS (
  SELECT t.id,
         row_number() OVER (ORDER BY (substring(t.title from '[0-9]+$'))::int) AS rn
    FROM tasks t
    JOIN difficulty_levels dl ON dl.id = t.difficulty_id
   WHERE dl.slug = 'medium' AND t.title ~ '^5 годных рислов [0-9]+$'
)
UPDATE tasks t
   SET title = '5 годных рислов ' || s.num,
       question = '5 годных рислов ' || s.num,
       updated_at = NOW()
  FROM existing
  JOIN squad_numbers s ON s.rn = existing.rn
 WHERE t.id = existing.id;

/* ── 2) Лишние номера — вон ───────────────────────────────────────────────── */

CREATE TEMP TABLE doomed_tasks ON COMMIT DROP AS
SELECT t.id
  FROM tasks t
 WHERE (
         t.title ~ '^Рисунок [0-9]+$'
      OR t.title ~ '^Нарисовать номер [0-9]+$'
      OR t.title ~ '^Рисунок ЦВЕТ [0-9]+$'
      OR t.title ~ '^5 годных рислов [0-9]+$'
       )
   AND substring(t.title from '[0-9]+$') NOT IN
       (SELECT num FROM squad_numbers);

DELETE FROM sector_tasks WHERE task_id IN (SELECT id FROM doomed_tasks);
UPDATE sectors SET task_id = NULL WHERE task_id IN (SELECT id FROM doomed_tasks);
DELETE FROM tasks WHERE id IN (SELECT id FROM doomed_tasks);

/* ── 3) Недостающие номера — досоздать ────────────────────────────────────── */

INSERT INTO tasks (title, question, difficulty_id)
SELECT f.prefix || ' ' || s.num,
       f.prefix || ' ' || s.num,
       (SELECT id FROM difficulty_levels WHERE slug = f.slug)
  FROM (VALUES
         ('Рисунок', 'easy'),
         ('Нарисовать номер', 'medium'),
         ('Рисунок ЦВЕТ', 'medium'),
         ('5 годных рислов', 'medium')
       ) AS f(prefix, slug)
 CROSS JOIN squad_numbers s
 WHERE NOT EXISTS (
   SELECT 1 FROM tasks t WHERE t.title = f.prefix || ' ' || s.num
 );
