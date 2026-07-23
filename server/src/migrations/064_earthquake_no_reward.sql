-- Earthquake law ("Землетрясение"): the admin scatters up to 8 sectors among
-- teams, one per team. An earthquake sector counts ONLY toward the "rulers" cup
-- (raw sector count) — it grants no influence, experience, streak or recaptures.
--
-- We mark such a sector so the influence queries skip it while the sector-count
-- (COUNT(*) of captured sectors) still includes it. A normal (re)capture clears
-- the flag, so the sector becomes rewarding again for whoever takes it properly.
ALTER TABLE sectors
  ADD COLUMN no_reward BOOLEAN NOT NULL DEFAULT false;
