ALTER TABLE sectors ALTER COLUMN number DROP NOT NULL;

UPDATE sectors SET number = NULL WHERE is_home_base = true;

ALTER TABLE sectors ADD CONSTRAINT sectors_home_base_number_null CHECK (
  (is_home_base = true AND number IS NULL) OR
  (is_home_base = false AND number IS NOT NULL)
);
