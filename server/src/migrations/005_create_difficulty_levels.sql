CREATE TABLE difficulty_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  influence_reward INTEGER NOT NULL DEFAULT 0,
  experience_reward INTEGER NOT NULL DEFAULT 0
);

INSERT INTO difficulty_levels (name, slug, influence_reward, experience_reward) VALUES
  ('Лёгкий', 'easy', 5, 10),
  ('Средний', 'medium', 10, 20),
  ('Сложный', 'hard', 20, 35),
  ('Ядро', 'core', 40, 50);
