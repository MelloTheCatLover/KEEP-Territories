CREATE UNIQUE INDEX idx_sectors_one_home_per_team
  ON sectors (home_team_id)
  WHERE is_home_base = true AND home_team_id IS NOT NULL;
