-- "Съезды" (congress) feature: laws proposed during a season's congress.
-- A law is free text; the admin later marks it accepted or rejected.

CREATE TABLE congress_laws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_congress_laws_season ON congress_laws(season_id, created_at DESC);
