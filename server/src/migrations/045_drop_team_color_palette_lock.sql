-- Admins (and captains) may now pick any colour via a colour picker, not just
-- the 8 palette hues. Drop the palette CHECK from migration 025. The per-season
-- UNIQUE index on colour (migration 023/036) stays — two teams still can't share
-- the exact same colour.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_color_palette_check;
