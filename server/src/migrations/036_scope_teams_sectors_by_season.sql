-- Scope teams and sectors to a season (one isolated world per shift).
-- captures/submissions stay unscoped: they reference team_id/sector_id which
-- are already season-bound, so their partial-unique invariants hold per season.

ALTER TABLE teams ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE CASCADE;
ALTER TABLE sectors ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE CASCADE;

-- Backfill existing rows into the default active season from migration 035.
UPDATE teams
SET season_id = (SELECT id FROM seasons WHERE status = 'active' ORDER BY created_at LIMIT 1)
WHERE season_id IS NULL;

UPDATE sectors
SET season_id = (SELECT id FROM seasons WHERE status = 'active' ORDER BY created_at LIMIT 1)
WHERE season_id IS NULL;

ALTER TABLE teams ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE sectors ALTER COLUMN season_id SET NOT NULL;

CREATE INDEX idx_teams_season ON teams(season_id);
CREATE INDEX idx_sectors_season ON sectors(season_id);

-- Team name: unique per season (was global, migration 013).
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_name_unique;
CREATE UNIQUE INDEX idx_teams_name_per_season ON teams(season_id, name);

-- Team color: unique per season (was global partial, migration 023).
-- Keep the index name — team.service maps 23505 on it to HTTP 409.
DROP INDEX IF EXISTS idx_teams_color_unique;
CREATE UNIQUE INDEX idx_teams_color_unique
  ON teams (season_id, color)
  WHERE color IS NOT NULL;

-- Sector coordinates: unique per season (was global UNIQUE(q, r), migration 007).
ALTER TABLE sectors DROP CONSTRAINT IF EXISTS sectors_q_r_key;
CREATE UNIQUE INDEX idx_sectors_qr_per_season ON sectors(season_id, q, r);

-- Sector number: unique per (season, difficulty) (was global, migration 021).
DROP INDEX IF EXISTS idx_sectors_number_per_difficulty;
CREATE UNIQUE INDEX idx_sectors_number_per_difficulty
  ON sectors(season_id, difficulty_id, number);
