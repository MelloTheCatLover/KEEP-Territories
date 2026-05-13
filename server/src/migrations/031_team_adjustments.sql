-- Admin overrides for team's derived numbers (influence/experience/upgrade
-- points). Stored as deltas so the underlying derivations from sectors and
-- captures stay intact. Stats themselves (5 characteristics) are still
-- physical rows in `team_stat_upgrades`; admin endpoint manages them via
-- DELETE+INSERT.

CREATE TABLE IF NOT EXISTS team_adjustments (
  team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  influence_delta INTEGER NOT NULL DEFAULT 0,
  experience_delta INTEGER NOT NULL DEFAULT 0,
  upgrade_points_delta INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
