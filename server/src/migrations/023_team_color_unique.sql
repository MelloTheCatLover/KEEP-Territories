CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_color_unique
  ON teams (color)
  WHERE color IS NOT NULL;
