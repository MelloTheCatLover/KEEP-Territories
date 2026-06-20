-- Global children registry. A child exists independently of lists and seasons,
-- carries one (optional) account reused across all their shifts, and has a short
-- human code so the admin can tell same-named children apart. list_members links
-- a child to a list. Existing roster_entries are migrated (deduped by the
-- whitespace-normalized full name); roster_entries is left in place, unused.

CREATE SEQUENCE children_code_seq START 1;

CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) NOT NULL UNIQUE
    DEFAULT ('CH' || lpad(nextval('children_code_seq')::text, 4, '0')),
  full_name VARCHAR(120) NOT NULL,
  name_key VARCHAR(120) NOT NULL,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  issued_password TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_children_name_key ON children(name_key);
CREATE INDEX idx_children_user ON children(user_id);

CREATE TABLE list_members (
  list_id UUID NOT NULL REFERENCES children_lists(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (list_id, child_id)
);

CREATE INDEX idx_list_members_child ON list_members(child_id);

-- One child per distinct normalized name, preferring a row that already has an
-- account (so the account is carried over), then the earliest.
INSERT INTO children (full_name, name_key, user_id, issued_password)
SELECT DISTINCT ON (btrim(regexp_replace(full_name, '\s+', ' ', 'g')))
       full_name,
       btrim(regexp_replace(full_name, '\s+', ' ', 'g')) AS name_key,
       user_id,
       issued_password
FROM roster_entries
ORDER BY btrim(regexp_replace(full_name, '\s+', ' ', 'g')),
         (user_id IS NULL), created_at;

-- Link each existing list membership to the matching child.
INSERT INTO list_members (list_id, child_id)
SELECT DISTINCT re.list_id, c.id
FROM roster_entries re
JOIN children c
  ON c.name_key = btrim(regexp_replace(re.full_name, '\s+', ' ', 'g'))
ON CONFLICT DO NOTHING;
