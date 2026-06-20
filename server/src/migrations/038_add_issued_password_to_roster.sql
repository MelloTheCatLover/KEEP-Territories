-- Store the generated password for admin-issued accounts so the counselor can
-- always look it up and export it. Plaintext on purpose (offline camp use):
-- only set for accounts the admin issues, never for self-registered children.
ALTER TABLE roster_entries ADD COLUMN issued_password VARCHAR(64);
