import { Pool, PoolClient } from 'pg';
import { pool } from '../config/db';
import { AuditEntryInput, AuditLogListResult, AuditLogView } from '../types/audit';

type Db = Pool | PoolClient;

/**
 * Append one audit entry. Never throws — auditing must not break the action it
 * records. Pass a transaction `client` to log within the same tx as the change.
 */
export async function record(entry: AuditEntryInput, db: Db = pool): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log
         (actor_user_id, team_id, action, entity_type, entity_id, season_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.actorUserId ?? null,
        entry.teamId ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.seasonId ?? null,
        entry.summary,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  } catch (err) {
    console.error('[audit] failed to record', entry.action, err);
  }
}

export interface AuditListFilters {
  teamId?: string;
  entityType?: string;
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function list(filters: AuditListFilters): Promise<AuditLogListResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, op: string, val: unknown): void => {
    params.push(val);
    where.push(`${col} ${op} $${params.length}`);
  };
  if (filters.teamId) add('al.team_id', '=', filters.teamId);
  if (filters.entityType) add('al.entity_type', '=', filters.entityType);
  if (filters.action) add('al.action', '=', filters.action);
  if (filters.actorUserId) add('al.actor_user_id', '=', filters.actorUserId);
  if (filters.from) add('al.created_at', '>=', filters.from);
  if (filters.to) add('al.created_at', '<=', filters.to);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM audit_log al ${whereSql}`,
    params,
  );
  const total = Number(totalRes.rows[0].count);

  params.push(filters.limit);
  const limIdx = params.length;
  params.push(filters.offset);
  const offIdx = params.length;

  const rowsRes = await pool.query<AuditLogView>(
    `SELECT al.id, al.actor_user_id, al.team_id, al.action, al.entity_type,
            al.entity_id, al.season_id, al.summary, al.metadata, al.created_at,
            u.username AS actor_username,
            u.full_name AS actor_full_name,
            t.name AS team_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       LEFT JOIN teams t ON t.id = al.team_id
       ${whereSql}
      ORDER BY al.created_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );

  return { items: rowsRes.rows, total, limit: filters.limit, offset: filters.offset };
}
