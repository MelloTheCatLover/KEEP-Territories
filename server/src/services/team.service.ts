import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { Team, CreateTeamDto } from '../types/team';
import { TeamFullStats } from '../types/team-stats';
import { AppError } from '../types/errors';
import * as teamStatsService from './team-stats.service';
import { getActiveSeasonId } from './season.service';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/** Allowed team palette — must mirror client/src/design-system/design-tokens.ts. */
const TEAM_COLOR_PALETTE: ReadonlySet<string> = new Set([
  '#E53935', '#F06A2C', '#E6B422', '#2BA84A',
  '#1BB5D4', '#2952D9', '#6366F1', '#D6409F',
]);

function normalizeColor(color: string | null | undefined): string | null {
  if (color == null) return null;
  return color.toUpperCase();
}

function assertPaletteColor(color: string | null): void {
  if (color == null) return;
  if (!HEX_COLOR_REGEX.test(color)) {
    throw new AppError(400, 'Color must be a valid hex (e.g. #FF5733)');
  }
  if (!TEAM_COLOR_PALETTE.has(color)) {
    throw new AppError(400, 'Color must be one of the team palette values');
  }
}

function isColorUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === 'idx_teams_color_unique';
}

function isColorPaletteViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === '23514' && e.constraint === 'teams_color_palette_check';
}

/**
 * Only children whose roster entry is in a list linked to the active season may
 * play (create or join a team). Everyone else can observe the map but not act.
 */
async function assertEnrolled(
  client: PoolClient,
  userId: string,
  seasonId: string,
): Promise<void> {
  const enrolled = await client.query(
    `SELECT 1
       FROM roster_entries re
       JOIN season_lists sl ON sl.list_id = re.list_id
      WHERE re.user_id = $1 AND sl.season_id = $2
      LIMIT 1`,
    [userId, seasonId],
  );
  if (enrolled.rows.length === 0) {
    throw new AppError(403, 'Вас нет в списках этого сезона — можно только наблюдать');
  }
}

export async function create(dto: CreateTeamDto, userId: string): Promise<TeamFullStats> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);

    const userCheck = await client.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (userCheck.rows[0].team_id) {
      throw new AppError(400, 'You are already in a team');
    }

    await assertEnrolled(client, userId, seasonId);

    const nameCheck = await client.query(
      'SELECT id FROM teams WHERE name = $1 AND season_id = $2',
      [dto.name, seasonId]
    );
    if (nameCheck.rows.length > 0) {
      throw new AppError(400, 'Team with this name already exists');
    }

    const normalizedColor = normalizeColor(dto.color);
    assertPaletteColor(normalizedColor);
    if (normalizedColor != null) {
      const colorCheck = await client.query(
        'SELECT id FROM teams WHERE color = $1 AND season_id = $2',
        [normalizedColor, seasonId]
      );
      if (colorCheck.rows.length > 0) {
        throw new AppError(409, 'This color is already taken by another team');
      }
    }

    const sectorResult = await client.query<{
      id: string;
      is_home_base: boolean;
      status: string;
      home_team_id: string | null;
      season_id: string;
    }>(
      `SELECT id, is_home_base, status, home_team_id, season_id
       FROM sectors
       WHERE id = $1
       FOR UPDATE`,
      [dto.home_sector_id]
    );
    if (sectorResult.rows.length === 0) {
      throw new AppError(404, 'Home sector not found');
    }
    const sector = sectorResult.rows[0];
    if (sector.season_id !== seasonId) {
      throw new AppError(400, 'Home sector belongs to another season');
    }
    if (!sector.is_home_base) {
      throw new AppError(400, 'Selected sector is not a home base');
    }
    if (sector.home_team_id || sector.status !== 'free') {
      throw new AppError(409, 'Home sector is already taken');
    }

    const teamResult = await client.query<Team>(
      `INSERT INTO teams (name, color, season_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.name, normalizedColor, seasonId]
    );
    const team = teamResult.rows[0];

    await client.query(
      `UPDATE users SET team_id = $1, team_role = 'captain' WHERE id = $2`,
      [team.id, userId]
    );

    await client.query(
      `UPDATE sectors
       SET status = 'captured',
           captured_by_team_id = $1,
           home_team_id = $1
       WHERE id = $2`,
      [team.id, sector.id]
    );

    await client.query(
      `INSERT INTO sector_captures (sector_id, team_id)
       VALUES ($1, $2)`,
      [sector.id, team.id]
    );

    await client.query('COMMIT');

    return teamStatsService.getFullStats(team.id);
  } catch (error) {
    await client.query('ROLLBACK');
    if (isColorUniqueViolation(error)) {
      throw new AppError(409, 'This color is already taken by another team');
    }
    if (isColorPaletteViolation(error)) {
      throw new AppError(400, 'Color must be one of the team palette values');
    }
    throw error;
  } finally {
    client.release();
  }
}


export async function getById(teamId: string): Promise<TeamFullStats> {
  return teamStatsService.getFullStats(teamId);
}

export async function join(teamId: string, userId: string): Promise<TeamFullStats> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);

    const userCheck = await client.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (userCheck.rows[0].team_id) {
      throw new AppError(400, 'You are already in a team');
    }

    const teamCheck = await client.query<{ season_id: string }>(
      'SELECT season_id FROM teams WHERE id = $1',
      [teamId]
    );
    if (teamCheck.rows.length === 0) {
      throw new AppError(404, 'Team not found');
    }
    if (teamCheck.rows[0].season_id !== seasonId) {
      throw new AppError(400, 'Эта команда не из активного сезона');
    }

    await assertEnrolled(client, userId, seasonId);

    await client.query(
      `UPDATE users SET team_id = $1, team_role = 'member' WHERE id = $2`,
      [teamId, userId]
    );

    await client.query('COMMIT');

    return getById(teamId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function leave(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }

    const { team_id, team_role } = userResult.rows[0];
    if (!team_id) {
      throw new AppError(400, 'You are not in a team');
    }

    if (team_role === 'captain') {
      const membersResult = await client.query(
        'SELECT id FROM users WHERE team_id = $1 AND id != $2',
        [team_id, userId]
      );

      if (membersResult.rows.length > 0) {
        throw new AppError(400, 'Transfer the captain role before leaving the team');
      }

      await client.query(
        'UPDATE users SET team_id = NULL, team_role = NULL WHERE id = $1',
        [userId]
      );
      await client.query(
        'DELETE FROM sector_captures WHERE team_id = $1',
        [team_id]
      );
      await client.query(
        `UPDATE sectors
         SET status = 'free',
             captured_by_team_id = NULL,
             capturing_by_team_id = NULL,
             capture_started_at = NULL,
             home_team_id = NULL,
             fortification_level = 0,
             current_action_type = NULL
         WHERE captured_by_team_id = $1
            OR capturing_by_team_id = $1
            OR home_team_id = $1`,
        [team_id]
      );
      await client.query(
        `DELETE FROM task_submissions WHERE team_id = $1`,
        [team_id]
      );
      await client.query('DELETE FROM teams WHERE id = $1', [team_id]);
    } else {
      await client.query(
        'UPDATE users SET team_id = NULL, team_role = NULL WHERE id = $1',
        [userId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function transferCaptain(currentUserId: string, newCaptainId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentUser = await client.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [currentUserId]
    );
    if (currentUser.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (currentUser.rows[0].team_role !== 'captain') {
      throw new AppError(403, 'Only the captain can transfer the role');
    }

    const teamId = currentUser.rows[0].team_id;

    const newCaptain = await client.query(
      'SELECT team_id FROM users WHERE id = $1',
      [newCaptainId]
    );
    if (newCaptain.rows.length === 0) {
      throw new AppError(404, 'Target user not found');
    }
    if (newCaptain.rows[0].team_id !== teamId) {
      throw new AppError(400, 'Target user is not in your team');
    }

    await client.query(
      `UPDATE users SET team_role = 'member' WHERE id = $1`,
      [currentUserId]
    );
    await client.query(
      `UPDATE users SET team_role = 'captain' WHERE id = $1`,
      [newCaptainId]
    );

    await client.query('COMMIT');
    return teamId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAll(): Promise<Team[]> {
  const seasonId = await getActiveSeasonId();
  const result = await pool.query<Team>(
    'SELECT * FROM teams WHERE season_id = $1 ORDER BY created_at DESC',
    [seasonId]
  );
  return result.rows;
}

export async function adminUpdate(
  teamId: string,
  patch: { name?: string; color?: string | null },
): Promise<TeamFullStats> {
  const fields: string[] = [];
  const params: Array<string | null> = [];

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      throw new AppError(400, 'Team name must be 1..50 chars');
    }
    fields.push(`name = $${fields.length + 1}`);
    params.push(trimmed);
  }
  if (patch.color !== undefined) {
    const normalized = normalizeColor(patch.color);
    assertPaletteColor(normalized);
    if (normalized !== null) {
      const colorCheck = await pool.query(
        'SELECT id FROM teams WHERE color = $1 AND id <> $2',
        [normalized, teamId],
      );
      if (colorCheck.rows.length > 0) {
        throw new AppError(409, 'This color is already taken by another team');
      }
    }
    fields.push(`color = $${fields.length + 1}`);
    params.push(normalized);
  }
  if (fields.length === 0) {
    throw new AppError(400, 'No fields to update');
  }

  params.push(teamId);
  let res;
  try {
    res = await pool.query<Team>(
      `UPDATE teams SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params,
    );
  } catch (err) {
    if (isColorUniqueViolation(err)) {
      throw new AppError(409, 'This color is already taken by another team');
    }
    if (isColorPaletteViolation(err)) {
      throw new AppError(400, 'Color must be one of the team palette values');
    }
    throw err;
  }
  if (res.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }
  return teamStatsService.getFullStats(teamId);
}

export async function adminDelete(teamId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [teamId]);
    if (exists.rows.length === 0) {
      throw new AppError(404, 'Team not found');
    }
    await client.query('DELETE FROM task_submissions WHERE team_id = $1', [teamId]);
    await client.query('DELETE FROM sector_captures WHERE team_id = $1', [teamId]);
    await client.query(
      `UPDATE sectors
       SET status = 'free',
           captured_by_team_id = NULL,
           capturing_by_team_id = NULL,
           capture_started_at = NULL,
           home_team_id = NULL,
           fortification_level = 0,
           current_action_type = NULL
       WHERE captured_by_team_id = $1
          OR capturing_by_team_id = $1
          OR home_team_id = $1`,
      [teamId],
    );
    await client.query(
      'UPDATE users SET team_id = NULL, team_role = NULL WHERE team_id = $1',
      [teamId],
    );
    await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function adminKickMember(teamId: string, userId: string): Promise<TeamFullStats | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query<{ team_id: string | null; team_role: 'captain' | 'member' | null }>(
      'SELECT team_id, team_role FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (user.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (user.rows[0].team_id !== teamId) {
      throw new AppError(400, 'User is not a member of this team');
    }

    const membersRes = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE team_id = $1',
      [teamId],
    );
    const membersCount = membersRes.rows.length;

    if (user.rows[0].team_role === 'captain' && membersCount > 1) {
      throw new AppError(400, 'Cannot kick captain while other members remain — transfer captaincy first');
    }

    await client.query(
      'UPDATE users SET team_id = NULL, team_role = NULL WHERE id = $1',
      [userId],
    );

    if (membersCount === 1) {
      await client.query('DELETE FROM task_submissions WHERE team_id = $1', [teamId]);
      await client.query('DELETE FROM sector_captures WHERE team_id = $1', [teamId]);
      await client.query(
        `UPDATE sectors
         SET status = 'free',
             captured_by_team_id = NULL,
             capturing_by_team_id = NULL,
             capture_started_at = NULL,
             home_team_id = NULL,
             fortification_level = 0,
             current_action_type = NULL
         WHERE captured_by_team_id = $1
            OR capturing_by_team_id = $1
            OR home_team_id = $1`,
        [teamId],
      );
      await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
      await client.query('COMMIT');
      return null;
    }

    await client.query('COMMIT');
    return teamStatsService.getFullStats(teamId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
