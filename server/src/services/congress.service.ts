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

// Every read returns the law plus the name of the team that vetoed it (if any),
// so the UI can label a vetoed law without a second lookup.
const LAW_SELECT = `
  SELECT l.id, l.season_id, l.text, l.status, l.created_at, l.decided_at,
         l.vetoed_by_team_id, vt.name AS vetoed_by_team_name
    FROM congress_laws l
    LEFT JOIN teams vt ON vt.id = l.vetoed_by_team_id
`;

/** Laws visible to participants: accepted or vetoed (a veto is public news). */
export async function listPublicLaws(): Promise<CongressLaw[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressLaw>(
    `${LAW_SELECT}
      WHERE l.season_id = $1 AND l.status IN ('accepted', 'vetoed')
      ORDER BY l.decided_at DESC NULLS LAST, l.created_at DESC`,
    [seasonId],
  );
  return res.rows;
}

export async function listLaws(): Promise<CongressLaw[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<CongressLaw>(
    `${LAW_SELECT}
      WHERE l.season_id = $1
      ORDER BY l.created_at DESC`,
    [seasonId],
  );
  return res.rows;
}

async function getById(id: string): Promise<CongressLaw> {
  const res = await pool.query<CongressLaw>(`${LAW_SELECT} WHERE l.id = $1`, [id]);
  if (res.rows.length === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return res.rows[0];
}

export async function createLaw(rawText: unknown): Promise<CongressLaw> {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length === 0) {
    throw new AppError(400, 'Текст закона обязателен');
  }
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<{ id: string }>(
    `INSERT INTO congress_laws (season_id, text) VALUES ($1, $2) RETURNING id`,
    [seasonId, text],
  );
  return getById(res.rows[0].id);
}

export async function updateLawText(id: string, rawText: unknown): Promise<CongressLaw> {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length === 0) {
    throw new AppError(400, 'Текст закона обязателен');
  }
  const res = await pool.query('UPDATE congress_laws SET text = $1 WHERE id = $2', [text, id]);
  if (res.rowCount === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return getById(id);
}

export async function setLawStatus(id: string, status: LawStatus): Promise<CongressLaw> {
  const decidedAt = status === 'pending' ? null : new Date();
  // Moving off a veto (back to pending etc.) clears the vetoing team.
  const res = await pool.query(
    `UPDATE congress_laws
        SET status = $1,
            decided_at = $2,
            vetoed_by_team_id = CASE WHEN $1 = 'vetoed' THEN vetoed_by_team_id ELSE NULL END
      WHERE id = $3`,
    [status, decidedAt, id],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return getById(id);
}

/**
 * Cast the veto on a law. The veto belongs to the top-influence team of the
 * season, so we resolve that team here rather than trusting the caller. One
 * veto per congress: a season may hold only a single vetoed law at a time.
 */
export async function vetoLaw(id: string): Promise<{ law: CongressLaw; teamId: string; teamName: string }> {
  const seasonId = await getActiveSeasonId();

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM congress_laws WHERE season_id = $1 AND status = 'vetoed' AND id <> $2`,
    [seasonId, id],
  );
  if (existing.rows.length > 0) {
    throw new AppError(409, 'На этом съезде вето уже использовано');
  }

  const top = await getTeamInfluence();
  if (top.length === 0) {
    throw new AppError(409, 'Нет команд — некому накладывать вето');
  }
  const vetoTeam = top[0];

  const res = await pool.query(
    `UPDATE congress_laws
        SET status = 'vetoed', decided_at = NOW(), vetoed_by_team_id = $1
      WHERE id = $2 AND season_id = $3`,
    [vetoTeam.id, id, seasonId],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Закон не найден');
  }
  return { law: await getById(id), teamId: vetoTeam.id, teamName: vetoTeam.name };
}

export async function deleteLaw(id: string): Promise<void> {
  const res = await pool.query('DELETE FROM congress_laws WHERE id = $1', [id]);
  if (res.rowCount === 0) {
    throw new AppError(404, 'Закон не найден');
  }
}
