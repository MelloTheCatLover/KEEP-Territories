CREATE TABLE sector_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sector_captures_team ON sector_captures(team_id);
CREATE INDEX idx_sector_captures_sector ON sector_captures(sector_id);
