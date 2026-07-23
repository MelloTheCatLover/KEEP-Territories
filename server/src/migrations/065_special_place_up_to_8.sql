-- Special-sector events now seat a full field of 8 teams (places 1..8), not 6.
-- Relax the place CHECK added in migration 056 so places 7 and 8 are accepted;
-- reward bundles for them live in special-sector.service (SPECIAL_PLACE_REWARDS).
ALTER TABLE special_sector_awards
  DROP CONSTRAINT IF EXISTS special_sector_awards_place_check;
ALTER TABLE special_sector_awards
  ADD CONSTRAINT special_sector_awards_place_check CHECK (place BETWEEN 1 AND 8);
