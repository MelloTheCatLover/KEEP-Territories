-- Remove tasks whose title and question contain no Cyrillic characters
-- (legacy English-only seed/test tasks). Cleans up dependent rows first
-- to avoid FK violations on sector_tasks.

DELETE FROM sector_tasks
WHERE task_id IN (
  SELECT id FROM tasks
  WHERE title    !~ '[А-Яа-яЁё]'
    AND question !~ '[А-Яа-яЁё]'
);

UPDATE sectors SET task_id = NULL
WHERE task_id IN (
  SELECT id FROM tasks
  WHERE title    !~ '[А-Яа-яЁё]'
    AND question !~ '[А-Яа-яЁё]'
);

DELETE FROM tasks
WHERE title    !~ '[А-Яа-яЁё]'
  AND question !~ '[А-Яа-яЁё]';
