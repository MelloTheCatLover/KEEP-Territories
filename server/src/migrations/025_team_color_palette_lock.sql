-- Normalize teams.color to the 8-color palette so map and team profile
-- always render the same hue. Non-palette values become NULL (rendered
-- with the index-based fallback). A CHECK constraint pairs with the
-- partial UNIQUE index from migration 023.

UPDATE teams
SET color = UPPER(color)
WHERE color IS NOT NULL;

UPDATE teams
SET color = NULL
WHERE color IS NOT NULL
  AND color NOT IN (
    '#E53935', '#F06A2C', '#E6B422', '#2BA84A',
    '#1BB5D4', '#2952D9', '#6366F1', '#D6409F'
  );

ALTER TABLE teams
  ADD CONSTRAINT teams_color_palette_check
  CHECK (
    color IS NULL OR color IN (
      '#E53935', '#F06A2C', '#E6B422', '#2BA84A',
      '#1BB5D4', '#2952D9', '#6366F1', '#D6409F'
    )
  );
