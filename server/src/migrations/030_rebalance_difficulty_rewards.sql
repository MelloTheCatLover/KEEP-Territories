-- Rebalance difficulty rewards. Influence stays small (capture pressure),
-- experience scales sharply so harder sectors meaningfully push level up.

UPDATE difficulty_levels SET influence_reward = 2,  experience_reward = 50   WHERE slug = 'easy';
UPDATE difficulty_levels SET influence_reward = 4,  experience_reward = 100  WHERE slug = 'medium';
UPDATE difficulty_levels SET influence_reward = 8,  experience_reward = 300  WHERE slug = 'hard';
UPDATE difficulty_levels SET influence_reward = 32, experience_reward = 1200 WHERE slug = 'core';
