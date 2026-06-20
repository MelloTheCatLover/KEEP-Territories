-- Issued passwords are now stored encrypted (AES-GCM, base64 + marker), which is
-- longer than the original 64 chars. Widen the column.
ALTER TABLE roster_entries ALTER COLUMN issued_password TYPE TEXT;
