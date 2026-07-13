import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  Season,
  SeasonWithLists,
  CreateSeasonDto,
  UpdateSeasonDto,
  SeasonFinals,
  FinalsMvp,
  SeasonRoster,
} from '../types/season';
import { computeSeasonTrophies } from './trophy.service';

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

const SEASON_WITH_LISTS = `
  SELECT s.id, s.name, s.starts_at, s.ends_at, s.status, s.created_at, s.mvp_child_id,
         COALESCE(
           ARRAY_AGG(sl.list_id) FILTER (WHERE sl.list_id IS NOT NULL),
           '{}'
         ) AS list_ids
    FROM seasons s
    LEFT JOIN season_lists sl ON sl.season_id = s.id
`;

export async function listAll(): Promise<SeasonWithLists[]> {
  const res = await pool.query<SeasonWithLists>(
    `${SEASON_WITH_LISTS}
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
  );
  return res.rows;
}

export async function getById(id: string): Promise<SeasonWithLists> {
  const res = await pool.query<SeasonWithLists>(
    `${SEASON_WITH_LISTS} WHERE s.id = $1 GROUP BY s.id`,
    [id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  return res.rows[0];
}

export async function create(dto: CreateSeasonDto): Promise<SeasonWithLists> {
  const name = dto.name.trim();
  if (name.length === 0 || name.length > 100) {
    throw new AppError(400, 'Название сезона: 1..100 символов');
  }
  const res = await pool.query<Season>(
    `INSERT INTO seasons (name, starts_at, ends_at, status)
     VALUES ($1, $2, $3, 'draft')
     RETURNING id`,
    [name, dto.starts_at ?? null, dto.ends_at ?? null],
  );
  return getById(res.rows[0].id);
}

export async function update(id: string, patch: UpdateSeasonDto): Promise<SeasonWithLists> {
  const fields: string[] = [];
  const params: Array<string | null> = [];
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new AppError(400, 'Название сезона: 1..100 символов');
    }
    fields.push(`name = $${fields.length + 1}`);
    params.push(name);
  }
  if (patch.starts_at !== undefined) {
    fields.push(`starts_at = $${fields.length + 1}`);
    params.push(patch.starts_at);
  }
  if (patch.ends_at !== undefined) {
    fields.push(`ends_at = $${fields.length + 1}`);
    params.push(patch.ends_at);
  }
  if (fields.length === 0) {
    throw new AppError(400, 'Нет полей для обновления');
  }
  params.push(id);
  const res = await pool.query(
    `UPDATE seasons SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  return getById(id);
}

/** Replace the season's linked children lists with the given set. */
export async function setLists(id: string, listIds: string[]): Promise<SeasonWithLists> {
  const unique = Array.from(new Set(listIds));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonRes = await client.query('SELECT id FROM seasons WHERE id = $1 FOR UPDATE', [id]);
    if (seasonRes.rows.length === 0) {
      throw new AppError(404, 'Сезон не найден');
    }

    if (unique.length > 0) {
      const found = await client.query<{ id: string }>(
        'SELECT id FROM children_lists WHERE id = ANY($1::uuid[])',
        [unique],
      );
      if (found.rows.length !== unique.length) {
        throw new AppError(400, 'Один из списков не найден');
      }
    }

    await client.query('DELETE FROM season_lists WHERE season_id = $1', [id]);
    for (const listId of unique) {
      await client.query(
        'INSERT INTO season_lists (season_id, list_id) VALUES ($1, $2)',
        [id, listId],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getById(id);
}

/**
 * Make a season the single active one. The previously active season is archived
 * and its players' team membership is cleared so they start fresh in the new
 * season (its map stays as a read-only archive).
 */
export async function activate(id: string): Promise<SeasonWithLists> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query<{ id: string }>(
      'SELECT id FROM seasons WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (target.rows.length === 0) {
      throw new AppError(404, 'Сезон не найден');
    }

    const current = await client.query<{ id: string }>(
      `SELECT id FROM seasons WHERE status = 'active'`,
    );
    const currentId = current.rows[0]?.id ?? null;

    if (currentId !== id) {
      if (currentId) {
        await client.query(
          `UPDATE users SET team_id = NULL, team_role = NULL
           WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
          [currentId],
        );
        await client.query(`UPDATE seasons SET status = 'archived' WHERE id = $1`, [currentId]);
      }
      await client.query(`UPDATE seasons SET status = 'active' WHERE id = $1`, [id]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getById(id);
}

/**
 * End the active season and move it to the read-only archive without promoting a
 * successor. Players' team membership is cleared so nobody can influence the map
 * anymore; the map, teams and trophies stay as a browsable archive.
 */
export async function archive(id: string): Promise<SeasonWithLists> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query<{ status: string }>(
      'SELECT status FROM seasons WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (res.rows.length === 0) {
      throw new AppError(404, 'Сезон не найден');
    }
    if (res.rows[0].status !== 'active') {
      throw new AppError(400, 'В архив можно отправить только активный сезон');
    }

    await client.query(
      `UPDATE users SET team_id = NULL, team_role = NULL
        WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [id],
    );
    await client.query(`UPDATE seasons SET status = 'archived' WHERE id = $1`, [id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getById(id);
}

/**
 * Team rosters of a season — who was on which team. Read from season_participants
 * (not users.team_id, which archival wipes), so it stays correct after a season
 * moves to the archive.
 */
export async function getRosters(id: string): Promise<SeasonRoster[]> {
  const season = await pool.query<{ id: string }>('SELECT id FROM seasons WHERE id = $1', [id]);
  if (season.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  const res = await pool.query<{
    team_id: string;
    team_name: string;
    team_color: string | null;
    child_id: string;
    full_name: string;
    user_id: string | null;
  }>(
    `SELECT t.id AS team_id, t.name AS team_name, t.color AS team_color,
            c.id AS child_id, c.full_name, c.user_id
       FROM season_participants sp
       JOIN teams t ON t.id = sp.team_id
       JOIN children c ON c.id = sp.child_id
      WHERE sp.season_id = $1 AND sp.team_id IS NOT NULL
      ORDER BY t.created_at ASC, sp.assigned_seq ASC NULLS LAST, c.full_name ASC`,
    [id],
  );

  const byTeam = new Map<string, SeasonRoster>();
  for (const r of res.rows) {
    let team = byTeam.get(r.team_id);
    if (!team) {
      team = { team_id: r.team_id, team_name: r.team_name, team_color: r.team_color, members: [] };
      byTeam.set(r.team_id, team);
    }
    team.members.push({ child_id: r.child_id, full_name: r.full_name, user_id: r.user_id });
  }
  return Array.from(byTeam.values());
}

/** Set (or clear) the season MVP — a child enrolled in one of its lists. */
export async function setMvp(id: string, childId: string | null): Promise<SeasonWithLists> {
  const season = await pool.query<{ id: string }>('SELECT id FROM seasons WHERE id = $1', [id]);
  if (season.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  if (childId) {
    const enrolled = await pool.query(
      `SELECT 1
         FROM children c
         JOIN list_members lm ON lm.child_id = c.id
         JOIN season_lists sl ON sl.list_id = lm.list_id
        WHERE c.id = $1 AND sl.season_id = $2
        LIMIT 1`,
      [childId, id],
    );
    if (enrolled.rows.length === 0) {
      throw new AppError(400, 'Этот ребёнок не участвует в смене');
    }
  }
  await pool.query('UPDATE seasons SET mvp_child_id = $1 WHERE id = $2', [childId, id]);
  return getById(id);
}

/**
 * Everything the season-finals presentation needs in one call: trophies (winners
 * revealed), overall standings, the champion team(s) and the MVP. Read-only, so
 * the admin can rehearse it repeatedly before archiving.
 */
export async function getFinals(id: string): Promise<SeasonFinals> {
  const seasonRes = await pool.query<{ name: string; status: Season['status']; mvp_child_id: string | null }>(
    'SELECT name, status, mvp_child_id FROM seasons WHERE id = $1',
    [id],
  );
  if (seasonRes.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  const { name, status, mvp_child_id } = seasonRes.rows[0];

  const { trophies, overall } = await computeSeasonTrophies(id, true);
  const champions = overall
    .filter((o) => o.place === 1)
    .map((o) => ({
      team_id: o.team_id,
      team_name: o.team_name,
      team_color: o.team_color,
      trophies_won: o.trophies_won,
    }));

  let mvp: FinalsMvp | null = null;
  if (mvp_child_id) {
    // Resolve the team via season_participants so it survives archiving (which
    // clears users.team_id).
    const mvpRes = await pool.query<{
      full_name: string;
      team_id: string | null;
      team_name: string | null;
      team_color: string | null;
    }>(
      `SELECT c.full_name, sp.team_id, t.name AS team_name, t.color AS team_color
         FROM children c
         LEFT JOIN season_participants sp ON sp.child_id = c.id AND sp.season_id = $2
         LEFT JOIN teams t ON t.id = sp.team_id
        WHERE c.id = $1`,
      [mvp_child_id, id],
    );
    if (mvpRes.rows.length > 0) {
      const r = mvpRes.rows[0];
      mvp = {
        child_id: mvp_child_id,
        full_name: r.full_name,
        team_id: r.team_id,
        team_name: r.team_name,
        team_color: r.team_color,
      };
    }
  }

  return {
    season_id: id,
    season_name: name,
    status,
    trophies,
    overall,
    champions,
    mvp,
  };
}

export async function remove(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query<{ status: string }>(
      'SELECT status FROM seasons WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (res.rows.length === 0) {
      throw new AppError(404, 'Сезон не найден');
    }
    if (res.rows[0].status === 'active') {
      throw new AppError(400, 'Нельзя удалить активный сезон — сначала активируйте другой');
    }

    // sector_captures has no ON DELETE CASCADE from sectors/teams, so clear it
    // first. Deleting the season then cascades season_lists, teams (→ penalties,
    // adjustments, stat_upgrades) and sectors (→ task_submissions, sector_tasks).
    await client.query(
      `DELETE FROM sector_captures
        WHERE sector_id IN (SELECT id FROM sectors WHERE season_id = $1)`,
      [id],
    );
    await client.query(
      `UPDATE users SET team_id = NULL, team_role = NULL
        WHERE team_id IN (SELECT id FROM teams WHERE season_id = $1)`,
      [id],
    );
    await client.query('DELETE FROM seasons WHERE id = $1', [id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
