-- Children lists (roster groups), shift seasons, and their membership.
-- A roster_entry is one child in a list; it claims a user account by code.
-- A season links to whole lists (season_lists); children in those lists may
-- play that season's map, everyone else only observes.

CREATE TABLE children_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES children_lists(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_roster_entries_list ON roster_entries(list_id);
CREATE INDEX idx_roster_entries_user ON roster_entries(user_id);

CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  starts_at DATE,
  ends_at DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gameplay always targets the single active season; archived ones are read-only.
CREATE UNIQUE INDEX idx_seasons_one_active ON seasons (status) WHERE status = 'active';

CREATE TABLE season_lists (
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES children_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, list_id)
);

-- Seed a default active season so existing map/teams have a home to scope into
-- (migration 036 backfills them). A fresh clone also starts with one active.
INSERT INTO seasons (name, status) VALUES ('Сезон 1', 'active');
