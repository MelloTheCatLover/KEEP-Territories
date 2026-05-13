-- Track penalties (lost influence/experience) applied to a team, e.g. when
-- the team drops an active capture. Influence/experience formulas in
-- team-stats.service subtract SUM(team_penalties.*) from the raw rewards.

CREATE TABLE IF NOT EXISTS team_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  influence INTEGER NOT NULL DEFAULT 0 CHECK (influence >= 0),
  experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  reason VARCHAR(40) NOT NULL,
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES task_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_penalties_team_id ON team_penalties(team_id);
