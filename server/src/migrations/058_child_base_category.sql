-- Prior standing a child brings in from outside the platform. Distribution
-- derives a category from in-DB season history, but that only covers shifts
-- played here; children who earned their status on earlier (offline) shifts
-- would all default to "newbie". The counselor's shift spreadsheet carries that
-- history, so it is imported here and prepare() takes the stronger of the two.
-- sparks is the child's lifetime points from the same sheet — informational,
-- kept alongside so the roster shows why a category was assigned.

ALTER TABLE children ADD COLUMN base_category participant_category;
ALTER TABLE children ADD COLUMN sparks INTEGER NOT NULL DEFAULT 0;
