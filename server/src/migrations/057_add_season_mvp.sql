-- MVP of a shift: chosen by the admin in advance, revealed during the season
-- finals ("МВП смены N — ФИО"). Nullable; cleared if the child is removed.
ALTER TABLE seasons
  ADD COLUMN mvp_child_id UUID REFERENCES children(id) ON DELETE SET NULL;
