-- Order in which teams got their turn to pick a colour after distribution.
-- Set when the colour wheel lands on a team, before the colour itself is
-- chosen, so a page reload mid-turn resumes on the same team instead of
-- re-spinning. A team with a seq and no colour is the turn in progress.

ALTER TABLE teams ADD COLUMN color_pick_seq INTEGER;

CREATE UNIQUE INDEX idx_teams_color_pick_seq
  ON teams (season_id, color_pick_seq)
  WHERE color_pick_seq IS NOT NULL;
