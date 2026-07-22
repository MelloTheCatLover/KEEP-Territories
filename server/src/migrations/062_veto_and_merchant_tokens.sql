-- Two additions.
--
-- 1) Veto. A team may cancel a law at a congress. The admin casts the veto on
--    behalf of the top-influence team, so a law gains a fourth status 'vetoed'
--    and remembers which team spent the veto.
--
-- 2) Merchant purchase tokens get a lifecycle. Capturing a merchant sector still
--    mints a token; now the admin marks it spent once the team has visited the
--    character and used the item. Unspent tokens are the team's "go collect"
--    notification. Existing trader tokens are wiped per request — they are
--    re-earned from sectors going forward.

ALTER TABLE congress_laws DROP CONSTRAINT IF EXISTS congress_laws_status_check;
ALTER TABLE congress_laws
  ADD CONSTRAINT congress_laws_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'vetoed'));

ALTER TABLE congress_laws
  ADD COLUMN vetoed_by_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE team_purchase_tokens
  ADD COLUMN spent_at TIMESTAMP WITH TIME ZONE;

-- Reset: drop every trader token so the count starts clean.
DELETE FROM team_purchase_tokens WHERE merchant_type = 'trader';
