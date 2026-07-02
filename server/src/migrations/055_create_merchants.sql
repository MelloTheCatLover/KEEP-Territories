-- Merchants: hidden NPCs seeded onto random capturable medium sectors at map
-- generation. Three kinds — master / saboteur / trader — two of each (6 total).
-- They are invisible on the map (no client-facing flag): the surprise is that
-- capturing such a sector mints a one-off "purchase token" for the capturing
-- team, surfaced on its team page. One token per (team, sector) — recapturing a
-- sector already looted never farms more.

ALTER TABLE sectors
  ADD COLUMN merchant_type VARCHAR(20)
    CHECK (merchant_type IS NULL OR merchant_type IN ('master', 'saboteur', 'trader'));

CREATE TABLE team_purchase_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  merchant_type VARCHAR(20) NOT NULL
    CHECK (merchant_type IN ('master', 'saboteur', 'trader')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- One token per team per merchant sector. NULLs are distinct in Postgres, so
  -- this only bites when sector_id is set (which it always is on grant).
  UNIQUE (team_id, sector_id)
);

CREATE INDEX idx_team_purchase_tokens_team ON team_purchase_tokens(team_id);
