-- Reward multiplier ("×1.5 награда"): an admin flag that makes sectors captured
-- while it is active yield more influence and experience. The multiplier is
-- snapshotted onto each sector at capture time, so already-captured sectors keep
-- what they earned and only newly-taken sectors are boosted. A normal recapture
-- restamps it with whatever the flag is at that moment.
ALTER TABLE sectors
  ADD COLUMN reward_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1;

-- The current global multiplier the flag toggles (1 = off, 1.5 = +50%).
INSERT INTO game_settings (key, value) VALUES ('reward_multiplier', '1')
  ON CONFLICT (key) DO NOTHING;
