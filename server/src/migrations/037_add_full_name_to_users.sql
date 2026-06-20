-- Real name on the account. Filled when an admin issues an account from a
-- roster entry; null for self-registered accounts (which only have a nickname).
ALTER TABLE users ADD COLUMN full_name VARCHAR(120);
