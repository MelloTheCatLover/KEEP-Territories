CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER UNIQUE NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  difficulty_id UUID NOT NULL REFERENCES difficulty_levels(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'free'
    CHECK (status IN ('free', 'capturing', 'captured')),
  captured_by_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  capturing_by_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  capture_started_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(q, r)
);

CREATE INDEX idx_sectors_status ON sectors(status);
CREATE INDEX idx_sectors_captured_by ON sectors(captured_by_team_id);
CREATE INDEX idx_sectors_capturing_by ON sectors(capturing_by_team_id);
CREATE INDEX idx_sectors_difficulty ON sectors(difficulty_id);

ALTER TABLE sectors ADD CONSTRAINT sectors_status_consistency CHECK (
  (status = 'free' AND captured_by_team_id IS NULL AND capturing_by_team_id IS NULL) OR
  (status = 'capturing' AND capturing_by_team_id IS NOT NULL AND capture_started_at IS NOT NULL) OR
  (status = 'captured' AND captured_by_team_id IS NOT NULL)
);
