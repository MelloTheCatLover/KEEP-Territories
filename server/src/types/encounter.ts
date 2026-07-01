import { StatName } from './team-stats';

export interface EncounterEffect {
  influence?: number;
  experience?: number;
  stats?: Partial<Record<StatName, number>>;
  level?: number;
  /** Stats to reset to 0 (overrides any delta on the same stat). */
  zeroStats?: StatName[];
  /** Two stats to swap values. */
  swapStats?: [StatName, StatName];
}

export interface TeamSnapshot {
  id: string;
  stats: Record<StatName, number>;
  influence: number;
  experience: number;
  level: number;
}

export interface EncounterChoiceOption {
  key: string;
  label: string;
}

/** Result of evaluating an encounter for a team (after any needed choice). */
export interface EncounterResolution {
  outcomeText: string;
  effect: EncounterEffect;
  /** true = a subsystem placeholder / Phase-2 rule: shown as text, no auto effect. */
  manual: boolean;
}

export interface EncounterEval {
  number: number;
  title: string;
  /** Full human-readable rules of the encounter (all branches). */
  description: string;
  /** The stat/aggregate the encounter reads, for display. */
  relevant: { label: string; value: number } | null;
  /** Non-null when a player choice is required before resolving. */
  choice: { prompt: string; options: EncounterChoiceOption[] } | null;
  /** Non-null once resolved (auto, or after a choice was supplied). */
  resolution: EncounterResolution | null;
}

export interface EncounterInstanceView {
  id: string;
  team_id: string;
  team_name: string | null;
  encounter_number: number;
  status: 'pending' | 'resolved';
  choice: string | null;
  outcome_text: string | null;
  applied: EncounterEffect | null;
  created_at: string;
  resolved_at: string | null;
  eval: EncounterEval;
}
