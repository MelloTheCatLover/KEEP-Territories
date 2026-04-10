export interface DifficultyLevel {
  id: string;
  name: string;
  slug: DifficultySlug;
  influence_reward: number;
  experience_reward: number;
}

export type DifficultySlug = 'easy' | 'medium' | 'hard' | 'core';
