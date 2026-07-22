export type LawStatus = 'pending' | 'accepted' | 'rejected' | 'vetoed';

export interface CongressLaw {
  id: string;
  season_id: string;
  text: string;
  status: LawStatus;
  created_at: string;
  decided_at: string | null;
  vetoed_by_team_id: string | null;
  vetoed_by_team_name: string | null;
}

export interface CongressTeamInfluence {
  id: string;
  name: string;
  color: string | null;
  influence: number;
}
