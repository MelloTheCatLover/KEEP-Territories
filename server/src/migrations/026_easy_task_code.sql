ALTER TABLE tasks
  ADD COLUMN code_language VARCHAR(16),
  ADD COLUMN code_template TEXT;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_code_language_check
    CHECK (code_language IS NULL OR code_language IN ('python', 'pascal'));

CREATE TABLE task_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ord INT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  expected_output TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, ord)
);

CREATE INDEX idx_task_test_cases_task ON task_test_cases(task_id);

ALTER TABLE task_submissions
  ADD COLUMN code TEXT,
  ADD COLUMN last_run_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN last_run_results JSONB,
  ADD COLUMN auto_approved BOOLEAN NOT NULL DEFAULT FALSE;
