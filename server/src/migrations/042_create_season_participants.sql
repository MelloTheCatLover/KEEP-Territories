-- Per-season participation record. Unlike users.team_id (which season.activate()
-- and remove() wipe), this survives archival, so it is the source of truth for
-- "who was on which team" and lets the next season derive a child's category
-- (newbie / participant / winner) from history. It also holds the live state of
-- the start-of-season team distribution: category and assigned team.

CREATE TYPE participant_category AS ENUM ('mvp', 'winner', 'participant', 'newbie');

CREATE TABLE season_participants (
  season_id    UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  child_id     UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  category     participant_category NOT NULL DEFAULT 'newbie',
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,  -- NULL until distributed
  assigned_seq INTEGER,                                       -- global order of assignment
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (season_id, child_id)
);

CREATE INDEX idx_season_participants_team ON season_participants(team_id);
CREATE INDEX idx_season_participants_season ON season_participants(season_id);
