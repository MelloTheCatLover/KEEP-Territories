CREATE OR REPLACE FUNCTION check_sector_task_difficulty()
RETURNS TRIGGER AS $$
DECLARE
  sector_diff UUID;
  task_diff UUID;
BEGIN
  SELECT difficulty_id INTO sector_diff FROM sectors WHERE id = NEW.sector_id;
  SELECT difficulty_id INTO task_diff FROM tasks WHERE id = NEW.task_id;
  IF sector_diff IS NULL OR task_diff IS NULL THEN
    RAISE EXCEPTION 'Sector or task not found';
  END IF;
  IF sector_diff != task_diff THEN
    RAISE EXCEPTION 'Task difficulty does not match sector difficulty';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_sector_task_difficulty
  BEFORE INSERT OR UPDATE ON sector_tasks
  FOR EACH ROW EXECUTE FUNCTION check_sector_task_difficulty();

CREATE OR REPLACE FUNCTION check_sector_static_task_difficulty()
RETURNS TRIGGER AS $$
DECLARE
  task_diff UUID;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;
  SELECT difficulty_id INTO task_diff FROM tasks WHERE id = NEW.task_id;
  IF task_diff IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF task_diff != NEW.difficulty_id THEN
    RAISE EXCEPTION 'Static task difficulty does not match sector difficulty';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_sector_static_task
  BEFORE INSERT OR UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION check_sector_static_task_difficulty();
