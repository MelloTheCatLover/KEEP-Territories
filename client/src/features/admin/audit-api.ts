import { api } from '../../shared/api/client';

export interface AuditLogEntry {
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

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditFilters {
  entityType?: string;
  teamId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export function getAuditLog(filters: AuditFilters = {}): Promise<AuditLogPage> {
  const qs = new URLSearchParams();
  if (filters.entityType) qs.set('entity_type', filters.entityType);
  if (filters.teamId) qs.set('team_id', filters.teamId);
  if (filters.action) qs.set('action', filters.action);
  qs.set('limit', String(filters.limit ?? 50));
  qs.set('offset', String(filters.offset ?? 0));
  return api.get<AuditLogPage>(`/audit?${qs.toString()}`);
}
