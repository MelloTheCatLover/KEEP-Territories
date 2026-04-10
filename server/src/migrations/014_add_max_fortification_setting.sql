INSERT INTO game_settings (key, value) VALUES ('max_fortification_level', '3')
  ON CONFLICT (key) DO NOTHING;
