CREATE TABLE team_stat_upgrades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stat_name VARCHAR(20) NOT NULL
    CHECK (stat_name IN ('strength', 'intelligence', 'endurance', 'leadership', 'luck')),
  level INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, level)
);

CREATE INDEX idx_team_stat_upgrades_team ON team_stat_upgrades(team_id);
