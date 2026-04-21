ALTER TABLE sectors DROP CONSTRAINT IF EXISTS sectors_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_number_per_difficulty
  ON sectors(difficulty_id, number);
