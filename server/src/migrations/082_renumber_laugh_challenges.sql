-- «Рассмешить» переезжает на номера новой смены: 09, 16, 34, 36, 78, 91, 114
-- (мигр. 081 сделала то же для «Рисунок», «Нарисовать номер», «Рисунок ЦВЕТ»
-- и «5 годных рислов»).
--
-- Старых номеров девять, новых семь. Выживают семь самых «расставленных» по
-- карте — так меньше секторов теряет задание; они переименовываются на месте,
-- поэтому привязки уцелевают. Двое лишних удаляются вместе с привязками, а
-- опустевшие слоты секторов добиваются случайными средними заданиями, чтобы
-- на каждом среднем секторе снова было пять.
--
-- `question = title`, поэтому правим оба поля.

CREATE TEMP TABLE squad_numbers (rn INT PRIMARY KEY, num TEXT) ON COMMIT DROP;
INSERT INTO squad_numbers (rn, num) VALUES
  (1, '09'), (2, '16'), (3, '34'), (4, '36'), (5, '78'), (6, '91'), (7, '114');

-- Кто остаётся: семь самых привязанных, при равенстве — меньший номер.
CREATE TEMP TABLE laugh_tasks ON COMMIT DROP AS
SELECT t.id,
       (substring(t.title from '[0-9]+$'))::int AS num,
       count(st.task_id) AS bindings
  FROM tasks t
  LEFT JOIN sector_tasks st ON st.task_id = t.id
 WHERE t.title ~ '^Рассмешить [0-9]+$'
 GROUP BY t.id, t.title;

CREATE TEMP TABLE laugh_keep ON COMMIT DROP AS
SELECT id, num, row_number() OVER (ORDER BY num) AS rn
  FROM (
    SELECT id, num FROM laugh_tasks
     ORDER BY bindings DESC, num ASC
     LIMIT 7
  ) top;

/* ── 1) Переименование уцелевших ──────────────────────────────────────────── */

UPDATE tasks t
   SET title = 'Рассмешить ' || s.num,
       question = 'Рассмешить ' || s.num,
       updated_at = NOW()
  FROM laugh_keep k
  JOIN squad_numbers s ON s.rn = k.rn
 WHERE t.id = k.id;

/* ── 2) Лишние — вон, вместе с привязками ─────────────────────────────────── */

CREATE TEMP TABLE laugh_doomed ON COMMIT DROP AS
SELECT id FROM laugh_tasks
 WHERE id NOT IN (SELECT id FROM laugh_keep);

DELETE FROM sector_tasks WHERE task_id IN (SELECT id FROM laugh_doomed);
UPDATE sectors SET task_id = NULL WHERE task_id IN (SELECT id FROM laugh_doomed);
DELETE FROM tasks WHERE id IN (SELECT id FROM laugh_doomed);

/* ── 3) Добить опустевшие слоты ───────────────────────────────────────────── */

WITH short AS (
  SELECT s.id, s.difficulty_id,
         (CASE dl.slug WHEN 'easy' THEN 6 WHEN 'medium' THEN 5 END) - count(st.task_id) AS need
    FROM sectors s
    JOIN difficulty_levels dl ON dl.id = s.difficulty_id
    LEFT JOIN sector_tasks st ON st.sector_id = s.id
   WHERE s.season_id = (SELECT id FROM seasons WHERE status = 'active')
     AND s.is_special = false AND s.is_home_base = false
     AND dl.slug IN ('easy', 'medium')
   GROUP BY s.id, s.difficulty_id, dl.slug
  HAVING (CASE dl.slug WHEN 'easy' THEN 6 WHEN 'medium' THEN 5 END) > count(st.task_id)
)
INSERT INTO sector_tasks (sector_id, task_id)
SELECT short.id, pick.id
  FROM short
 CROSS JOIN LATERAL (
   SELECT t.id
     FROM tasks t
    WHERE t.difficulty_id = short.difficulty_id
      AND NOT EXISTS (
        SELECT 1 FROM sector_tasks st
         WHERE st.sector_id = short.id AND st.task_id = t.id
      )
    ORDER BY random()
    LIMIT short.need
 ) pick;
