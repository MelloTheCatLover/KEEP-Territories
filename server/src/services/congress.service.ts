import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { CongressLaw, CongressTeamInfluence, LawStatus } from '../types/congress';
import { getActiveSeasonId } from './season.service';

/** Teams of the active season with their current influence, highest first. */
export async function getTeamInfluence(): Promise<CongressTeamInfluence[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressTeamInfluence>(
    `SELECT t.id, t.name, t.color,
            GREATEST(
              0,
              COALESCE((SELECT SUM(dl.influence_reward)
                          FROM sectors s
                          JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                         WHERE s.captured_by_team_id = t.id AND s.is_special = false), 0)
              + COALESCE((SELECT SUM(influence) FROM special_sector_awards WHERE team_id = t.id), 0)
              - COALESCE((SELECT SUM(influence) FROM team_penalties WHERE team_id = t.id), 0)
              + COALESCE((SELECT influence_delta FROM team_adjustments WHERE team_id = t.id), 0)
            )::int AS influence
       FROM teams t
      WHERE t.season_id = $1
      ORDER BY influence DESC, t.name ASC`,
    [seasonId],
  );
  return res.rows;
}

/** Laws visible to participants: only accepted ones. */
export async function listPublicLaws(): Promise<CongressLaw[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressLaw>(
    `SELECT id, season_id, text, status, created_at, decided_at
       FROM congress_laws
      WHERE season_id = $1 AND status = 'accepted'
      ORDER BY decided_at DESC NULLS LAST, created_at DESC`,
    [seasonId],
  );
  return res.rows;
}

export async function listLaws(): Promise<CongressLaw[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressLaw>(
    `SELECT id, season_id, text, status, created_at, decided_at
       FROM congress_laws
      WHERE season_id = $1
      ORDER BY created_at DESC`,
    [seasonId],
  );
  return res.rows;
}

export async function createLaw(rawText: unknown): Promise<CongressLaw> {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length === 0) {
    throw new AppError(400, 'Текст закона обязателен');
  }
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressLaw>(
    `INSERT INTO congress_laws (season_id, text)
       VALUES ($1, $2)
       RETURNING id, season_id, text, status, created_at, decided_at`,
    [seasonId, text],
  );
  return res.rows[0];
}

export async function updateLawText(id: string, rawText: unknown): Promise<CongressLaw> {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length === 0) {
    throw new AppError(400, 'Текст закона обязателен');
  }
  const res = await pool.query<CongressLaw>(
    `UPDATE congress_laws SET text = $1 WHERE id = $2
      RETURNING id, season_id, text, status, created_at, decided_at`,
    [text, id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return res.rows[0];
}

export async function setLawStatus(id: string, status: LawStatus): Promise<CongressLaw> {
  const decidedAt = status === 'pending' ? null : new Date();
  const res = await pool.query<CongressLaw>(
    `UPDATE congress_laws
        SET status = $1,
            decided_at = $2
      WHERE id = $3
      RETURNING id, season_id, text, status, created_at, decided_at`,
    [status, decidedAt, id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return res.rows[0];
}

export async function deleteLaw(id: string): Promise<void> {
  const res = await pool.query('DELETE FROM congress_laws WHERE id = $1', [id]);
  if (res.rowCount === 0) {
    throw new AppError(404, 'Закон не найден');
  }
}
