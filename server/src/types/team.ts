export interface Team {
  id: string;
  name: string;
  color: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTeamDto {
  name: string;
  color?: string | null;
}
