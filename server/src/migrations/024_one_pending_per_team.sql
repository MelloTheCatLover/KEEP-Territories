CREATE UNIQUE INDEX IF NOT EXISTS idx_task_submissions_one_pending_per_team
  ON task_submissions (team_id)
  WHERE status = 'pending';
