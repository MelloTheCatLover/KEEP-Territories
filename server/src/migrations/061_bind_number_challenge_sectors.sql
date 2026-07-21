-- Put each number-based group into its own medium sector.
--
-- The «Рассмешить» tasks were bound one-by-one by an earlier distribution pass,
-- so the group ended up smeared over six sectors (#4, #5, #15, #18, #20, #22)
-- with the same task in several of them, and migration 060's new numbers plus
-- the whole «Нарисовать номер» group were bound nowhere. A group sector holds
-- that group and nothing else: the wheel on it always lands on a squad number.
--
-- Sector #5 keeps «Рассмешить» (it already held most of it), #7 takes
-- «Нарисовать номер». Both are regular (non-special) medium sectors of the
-- active season; archived seasons are history and stay untouched.

DO $body$
DECLARE
  v_season UUID;
  v_laugh  UUID;
  v_draw   UUID;
BEGIN
  SELECT id INTO v_season
    FROM seasons WHERE status = 'active' ORDER BY created_at LIMIT 1;
  IF v_season IS NULL THEN
    RAISE NOTICE 'no active season — nothing to bind';
    RETURN;
  END IF;

  SELECT s.id INTO v_laugh
    FROM sectors s
    JOIN difficulty_levels d ON d.id = s.difficulty_id
   WHERE s.season_id = v_season AND d.slug = 'medium'
     AND NOT s.is_special AND s.number = 5;

  SELECT s.id INTO v_draw
    FROM sectors s
    JOIN difficulty_levels d ON d.id = s.difficulty_id
   WHERE s.season_id = v_season AND d.slug = 'medium'
     AND NOT s.is_special AND s.number = 7;

  IF v_laugh IS NULL OR v_draw IS NULL THEN
    RAISE NOTICE 'medium sectors #5/#7 not found in the active season — nothing to bind';
    RETURN;
  END IF;

  -- 1) Drop the scattered bindings of both groups across the active season.
  DELETE FROM sector_tasks st
   USING tasks t, sectors s
   WHERE st.task_id = t.id
     AND st.sector_id = s.id
     AND s.season_id = v_season
     AND (t.title LIKE 'Рассмешить %' OR t.title LIKE 'Нарисовать номер %');

  -- 2) A group sector is dedicated — clear whatever else was pooled there.
  DELETE FROM sector_tasks WHERE sector_id IN (v_laugh, v_draw);
  UPDATE sectors SET task_id = NULL WHERE id IN (v_laugh, v_draw);

  -- 3) Bind each group whole.
  INSERT INTO sector_tasks (sector_id, task_id)
  SELECT v_laugh, id FROM tasks WHERE title LIKE 'Рассмешить %';

  INSERT INTO sector_tasks (sector_id, task_id)
  SELECT v_draw, id FROM tasks WHERE title LIKE 'Нарисовать номер %';
END $body$;
