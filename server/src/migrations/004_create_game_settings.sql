CREATE TABLE game_settings (
  key VARCHAR(100) PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO game_settings (key, value) VALUES
  ('base_exp_threshold', '50'),
  ('exp_step', '10');

CREATE TRIGGER trg_game_settings_updated_at
  BEFORE UPDATE ON game_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
