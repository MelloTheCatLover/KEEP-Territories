-- Special-event sectors carry no number (like home bases). Widen the
-- home-base/number invariant so a sector has a number iff it is a normal
-- capturable sector — i.e. neither a home base nor a special-event sector.
ALTER TABLE sectors DROP CONSTRAINT IF EXISTS sectors_home_base_number_null;
ALTER TABLE sectors ADD CONSTRAINT sectors_home_base_number_null CHECK (
  ((is_home_base OR is_special) AND number IS NULL)
  OR (NOT is_home_base AND NOT is_special AND number IS NOT NULL)
);
