export type LawStatus = 'pending' | 'accepted' | 'rejected';

export interface CongressLaw {
  id: string;
  season_id: string;
  text: string;
  status: LawStatus;
  created_at: string;
  decided_at: string | null;
}

export interface CongressTeamInfluence {
  id: string;
  name: string;
  color: string | null;
  influence: number;
}
