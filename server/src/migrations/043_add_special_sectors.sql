-- Special-event sectors: blue, non-capturable cells that decorate a ring but
-- can never be taken by a team. They carry a normal difficulty_id (they live in
-- the medium ring) but are flagged so capture logic and the map renderer skip
-- them. No tasks are attached.
ALTER TABLE sectors
  ADD COLUMN is_special BOOLEAN NOT NULL DEFAULT FALSE;
