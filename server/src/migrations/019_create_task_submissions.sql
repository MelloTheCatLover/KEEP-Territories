CREATE TABLE task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  action_type VARCHAR(30) NOT NULL
    CHECK (action_type IN ('capture', 'fortify', 'remove_fortification', 'recapture')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_submissions_status ON task_submissions(status);
CREATE INDEX idx_task_submissions_sector ON task_submissions(sector_id);
CREATE INDEX idx_task_submissions_team ON task_submissions(team_id);
CREATE INDEX idx_task_submissions_created ON task_submissions(created_at DESC);

CREATE UNIQUE INDEX idx_task_submissions_one_pending_per_sector
  ON task_submissions(sector_id)
  WHERE status = 'pending';
