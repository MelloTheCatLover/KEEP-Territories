export interface AuditEntryInput {
  /** User who triggered the action (admin or team member). Null for system events. */
  actorUserId?: string | null;
  /** Subject team the action concerns, if any. */
  teamId?: string | null;
  /** Machine action key, e.g. 'sector.capture', 'team.update'. */
  action: string;
  /** 'sector' | 'team' | 'submission' | 'season' | 'task' | 'map' | ... */
  entityType: string;
  entityId?: string | null;
  seasonId?: string | null;
  /** Pre-rendered RU one-liner shown in the admin log. */
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogView {
  id: string;
  actor_user_id: string | null;
  team_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  season_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_username: string | null;
  actor_full_name: string | null;
  team_name: string | null;
}

export interface AuditLogListResult {
  items: AuditLogView[];
  total: number;
  limit: number;
  offset: number;
}
