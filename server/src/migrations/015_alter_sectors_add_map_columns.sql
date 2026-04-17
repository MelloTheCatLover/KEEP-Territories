DELETE FROM sectors;

ALTER TABLE sectors ADD COLUMN fortification_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sectors ADD COLUMN is_home_base BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sectors ADD COLUMN home_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE sectors ADD COLUMN current_action_type VARCHAR(30)
  CHECK (current_action_type IS NULL OR current_action_type IN (
    'capture', 'fortify', 'remove_fortification', 'recapture'
  ));

ALTER TABLE sectors ADD CONSTRAINT sectors_fortification_range
  CHECK (fortification_level >= 0 AND fortification_level <= 3);

ALTER TABLE sectors ADD CONSTRAINT sectors_home_base_owner
  CHECK (is_home_base = false OR captured_by_team_id = home_team_id);
