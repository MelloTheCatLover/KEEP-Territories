-- Two per-capture allowances driven by stats.
--
-- Reroll (удача): a team may re-spin the assigned task. reroll_count tracks how
-- many times it has done so for a submission; the cap comes from luck.
--
-- Check / разведка (интеллект): a team may preview a sector's task pool before
-- committing. Each distinct peeked sector consumes one check; the budget (from
-- intelligence) refreshes on every capture, so peeks are wiped when the team
-- captures a sector (see submission.service applyApprovedEffect).

ALTER TABLE task_submissions ADD COLUMN reroll_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sector_peeks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sector_id  UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, sector_id)
);

CREATE INDEX idx_sector_peeks_team ON sector_peeks(team_id);
