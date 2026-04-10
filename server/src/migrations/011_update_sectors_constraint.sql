ALTER TABLE sectors DROP CONSTRAINT sectors_status_consistency;

ALTER TABLE sectors ADD CONSTRAINT sectors_status_consistency CHECK (
  (status = 'free' AND captured_by_team_id IS NULL AND capturing_by_team_id IS NULL) OR
  (status = 'capturing' AND capturing_by_team_id IS NOT NULL AND capture_started_at IS NOT NULL) OR
  (status = 'captured' AND captured_by_team_id IS NOT NULL)
);
