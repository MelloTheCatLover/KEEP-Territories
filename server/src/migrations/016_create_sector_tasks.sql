CREATE TABLE sector_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sector_tasks_unique ON sector_tasks(sector_id, task_id);
CREATE INDEX idx_sector_tasks_sector ON sector_tasks(sector_id);
CREATE INDEX idx_sector_tasks_task ON sector_tasks(task_id);
