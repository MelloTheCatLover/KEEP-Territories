-- Special-sector events: an admin "captures" a special sector by entering the
-- final standings (places 1..6). Each placed team is awarded a fixed influence
-- and experience bundle per its place. The sector itself is painted in the
-- 1st-place team's colour (captured_by_team_id), and that team also earns the
-- capture-cup credit (streak, captured count). Places 2..6 earn only the
-- influence/experience bundle plus "champions" points.
--
-- Rewards are additive on top of the normal sector derivations, so special
-- sectors are EXCLUDED from the difficulty-based influence sum (see
-- team-stats / trophy / congress services) and their reward comes solely from
-- this table — no double counting.

CREATE TABLE special_sector_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  place SMALLINT NOT NULL CHECK (place BETWEEN 1 AND 6),
  influence INTEGER NOT NULL,
  experience INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- One place per team per event, and each place used at most once per event.
  UNIQUE (sector_id, team_id),
  UNIQUE (sector_id, place)
);

CREATE INDEX idx_special_sector_awards_team ON special_sector_awards(team_id);
CREATE INDEX idx_special_sector_awards_sector ON special_sector_awards(sector_id);
