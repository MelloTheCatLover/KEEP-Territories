import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';

type Queryable = Pick<PoolClient, 'query'>;

/**
 * Id of the single active season. Gameplay (map, teams, actions) always targets
 * it; archived seasons are read-only. A fresh database is seeded with one active
 * season (migration 035), so this normally never throws.
 */
export async function getActiveSeasonId(client?: Queryable): Promise<string> {
  const q: Queryable = client ?? pool;
  const res = await q.query<{ id: string }>(
    `SELECT id FROM seasons WHERE status = 'active' ORDER BY created_at LIMIT 1`,
  );
  if (res.rows.length === 0) {
    throw new AppError(409, 'Нет активного сезона');
  }
  return res.rows[0].id;
}
