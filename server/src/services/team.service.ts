import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { Team, CreateTeamDto } from '../types/team';
import { TeamFullStats } from '../types/team-stats';
import { AppError } from '../types/errors';
import { familyOfColor } from '../types/team-palette';
import * as teamStatsService from './team-stats.service';
import { getActiveSeasonId } from './season.service';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

function normalizeColor(color: string | null | undefined): string | null {
  if (color == null) return null;
  return color.toUpperCase();
}

/** Any valid 6-digit hex is allowed — admins pick freely via the colour picker. */
function assertHexColor(color: string | null): void {
  if (color == null) return;
  if (!HEX_COLOR_REGEX.test(color)) {
    throw new AppError(400, 'Color must be a valid hex (e.g. #FF5733)');
  }
}

function isColorUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === 'idx_teams_color_unique';
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
       FROM children c
       JOIN list_members lm ON lm.child_id = c.id
       JOIN season_lists sl ON sl.list_id = lm.list_id
      WHERE c.user_id = $1 AND sl.season_id = $2
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

    const userCheck = await client.query<{ team_id: string | null; role: string }>(
      'SELECT team_id, role FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (userCheck.rows[0].team_id) {
      throw new AppError(400, 'You are already in a team');
    }

    // Admins skip the roster check so they can join any active season to test it.
    if (userCheck.rows[0].role !== 'admin') {
      if (await seasonHasDistribution(client, seasonId)) {
        throw new AppError(403, 'Команды формирует администратор в начале сезона');
      }
      await assertEnrolled(client, userId, seasonId);
    }

    const nameCheck = await client.query(
      'SELECT id FROM teams WHERE name = $1 AND season_id = $2',
      [dto.name, seasonId]
    );
    if (nameCheck.rows.length > 0) {
      throw new AppError(400, 'Team with this name already exists');
    }

    const normalizedColor = normalizeColor(dto.color);
    assertHexColor(normalizedColor);
    if (normalizedColor != null) {
      // A palette colour is claimed per family: a rival on a lighter shade of
      // green still owns green, so the whole family is off the table.
      const wanted = familyOfColor(normalizedColor);
      const existing = await client.query<{ color: string | null }>(
        'SELECT color FROM teams WHERE season_id = $1',
        [seasonId]
      );
      const clash = wanted
        ? existing.rows.some((r) => familyOfColor(r.color)?.key === wanted.key)
        : existing.rows.some((r) => r.color === normalizedColor);
      if (clash) {
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

    const userCheck = await client.query<{ team_id: string | null; role: string }>(
      'SELECT team_id, role FROM users WHERE id = $1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (userCheck.rows[0].team_id) {
      throw new AppError(400, 'You are already in a team');
    }
    // Admins run the field via the "play as team" selector — they never join.
    if (userCheck.rows[0].role === 'admin') {
      throw new AppError(403, 'Администратор не вступает в команды — используйте режим «играю за команду» на карте');
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

    // Admins skip the roster check so they can join any active season to test it.
    if (userCheck.rows[0].role !== 'admin') {
      if (await seasonHasDistribution(client, seasonId)) {
        throw new AppError(403, 'Команды формирует администратор в начале сезона');
      }
      await assertEnrolled(client, userId, seasonId);
    }

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

/**
 * Admin reassigns the captain of a team: promotes `newCaptainId` and demotes the
 * current captain (if any) to member. Unlike {@link transferCaptain}, the actor
 * is an admin, not the outgoing captain, so there is no self-transfer guard.
 */
export async function adminSetCaptain(teamId: string, newCaptainId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query<{ team_id: string | null; team_role: string | null }>(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [newCaptainId]
    );
    if (target.rows.length === 0) {
      throw new AppError(404, 'Target user not found');
    }
    if (target.rows[0].team_id !== teamId) {
      throw new AppError(400, 'Target user is not in this team');
    }
    if (target.rows[0].team_role === 'captain') {
      // Already captain — nothing to do, keep it idempotent.
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `UPDATE users SET team_role = 'member' WHERE team_id = $1 AND team_role = 'captain'`,
      [teamId]
    );
    await client.query(
      `UPDATE users SET team_role = 'captain' WHERE id = $1`,
      [newCaptainId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAll(seasonId?: string): Promise<Team[]> {
  const sid = seasonId ?? (await getActiveSeasonId());
  const result = await pool.query<Team>(
    'SELECT * FROM teams WHERE season_id = $1 ORDER BY created_at DESC',
    [sid]
  );
  return result.rows;
}

/** True when the admin has prepared start-of-season distribution for the season. */
async function seasonHasDistribution(client: PoolClient, seasonId: string): Promise<boolean> {
  const res = await client.query(
    'SELECT 1 FROM season_participants WHERE season_id = $1 LIMIT 1',
    [seasonId],
  );
  return res.rows.length > 0;
}

/** Apply name/color changes to a team, with palette + per-season uniqueness checks. */
async function applyTeamIdentity(
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
    assertHexColor(normalized);
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
    throw err;
  }
  if (res.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }
  return teamStatsService.getFullStats(teamId);
}

export async function adminUpdate(
  teamId: string,
  patch: { name?: string; color?: string | null },
): Promise<TeamFullStats> {
  return applyTeamIdentity(teamId, patch);
}

/**
 * Captain sets their own team's name/colour. Used after admin distribution, when
 * teams are created empty ("Команда N", no colour) for the captain to personalize.
 *
 * Colour is constrained to the palette: a team that already holds a family may
 * only move between that family's shades, so the map never gets two teams whose
 * colours read the same. A team without a colour yet claims a free family.
 */
export async function setIdentity(
  userId: string,
  patch: { name?: string; color?: string | null },
): Promise<TeamFullStats> {
  const userRes = await pool.query<{ team_id: string | null; team_role: string | null }>(
    'SELECT team_id, team_role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  const teamId = userRes.rows[0].team_id;
  if (!teamId) {
    throw new AppError(400, 'You are not in a team');
  }
  if (userRes.rows[0].team_role !== 'captain') {
    throw new AppError(403, 'Название и цвет команды меняет капитан');
  }

  if (patch.color != null) {
    const wanted = familyOfColor(patch.color);
    if (!wanted) {
      throw new AppError(400, 'Цвет не из палитры команд');
    }
    const teamRes = await pool.query<{ color: string | null; season_id: string }>(
      'SELECT color, season_id FROM teams WHERE id = $1',
      [teamId],
    );
    if (teamRes.rows.length === 0) {
      throw new AppError(404, 'Team not found');
    }
    const current = familyOfColor(teamRes.rows[0].color);
    if (current && current.key !== wanted.key) {
      throw new AppError(
        400,
        `Команда играет в цвете «${current.label}» — доступны только его оттенки`,
      );
    }
    if (!current) {
      const others = await pool.query<{ color: string | null }>(
        'SELECT color FROM teams WHERE season_id = $1 AND id <> $2',
        [teamRes.rows[0].season_id, teamId],
      );
      if (others.rows.some((r) => familyOfColor(r.color)?.key === wanted.key)) {
        throw new AppError(409, 'Этот цвет уже занят другой командой');
      }
    }
  }

  return applyTeamIdentity(teamId, patch);
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

/** Point the child's distribution assignment at `teamId` (NULL to unassign). */
async function setParticipantTeam(
  client: PoolClient,
  seasonId: string,
  userId: string,
  teamId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE season_participants sp SET team_id = $1
       FROM children c
      WHERE c.id = sp.child_id AND c.user_id = $2 AND sp.season_id = $3`,
    [teamId, userId, seasonId],
  );
}

/** Clear the child's distribution assignment for the team's season. */
async function clearParticipantTeam(
  client: PoolClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const seasonRes = await client.query<{ season_id: string }>(
    'SELECT season_id FROM teams WHERE id = $1',
    [teamId],
  );
  if (seasonRes.rows.length === 0) return;
  await setParticipantTeam(client, seasonRes.rows[0].season_id, userId, null);
}

/**
 * Move a player into `targetTeamId` from any other team (or from no team, e.g.
 * after a kick). Keeps the distribution snapshot in sync, promotes a replacement
 * captain if a captain leaves a team that still has members, and makes the moved
 * player captain of the target only when it currently has none.
 */
export async function adminAssignMember(targetTeamId: string, userId: string): Promise<TeamFullStats> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = await client.query<{ team_id: string | null; team_role: 'captain' | 'member' | null; role: string }>(
      'SELECT team_id, team_role, role FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (user.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    if (user.rows[0].role === 'admin') {
      throw new AppError(400, 'Администратор не состоит в командах');
    }
    const { team_id: sourceTeamId, team_role: sourceRole } = user.rows[0];
    if (sourceTeamId === targetTeamId) {
      throw new AppError(400, 'Участник уже в этой команде');
    }

    const target = await client.query<{ season_id: string }>(
      'SELECT season_id FROM teams WHERE id = $1 FOR UPDATE',
      [targetTeamId],
    );
    if (target.rows.length === 0) {
      throw new AppError(404, 'Целевая команда не найдена');
    }
    const seasonId = target.rows[0].season_id;

    // If a captain leaves a team that still has other members, promote the
    // longest-standing remaining member so the source team keeps a captain.
    if (sourceTeamId && sourceRole === 'captain') {
      const heir = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE team_id = $1 AND id <> $2
          ORDER BY created_at ASC LIMIT 1`,
        [sourceTeamId, userId],
      );
      if (heir.rows.length > 0) {
        await client.query(`UPDATE users SET team_role = 'captain' WHERE id = $1`, [heir.rows[0].id]);
      }
    }

    const hasCaptain = await client.query(
      `SELECT 1 FROM users WHERE team_id = $1 AND team_role = 'captain' LIMIT 1`,
      [targetTeamId],
    );
    const newRole = hasCaptain.rows.length === 0 ? 'captain' : 'member';

    await client.query(
      `UPDATE users SET team_id = $1, team_role = $2 WHERE id = $3`,
      [targetTeamId, newRole, userId],
    );
    await setParticipantTeam(client, seasonId, userId, targetTeamId);

    await client.query('COMMIT');
    return teamStatsService.getFullStats(targetTeamId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface RosterMember {
  child_id: string;
  full_name: string | null;
  user_id: string | null;
  has_account: boolean;
  team_id: string | null;
  team_name: string | null;
}

/**
 * Full roster of the active season: every enrolled child with their account (if
 * any) and current team. Powers the admin "add from list" picker — kids with no
 * account can't be playable members yet, so the caller disables them.
 */
export async function listRoster(seasonId?: string): Promise<RosterMember[]> {
  const sid = seasonId ?? (await getActiveSeasonId());
  const res = await pool.query<RosterMember>(
    `SELECT c.id AS child_id, c.full_name, c.user_id,
            (c.user_id IS NOT NULL) AS has_account,
            u.team_id, t.name AS team_name
       FROM children c
       JOIN list_members lm ON lm.child_id = c.id
       JOIN season_lists sl ON sl.list_id = lm.list_id
       LEFT JOIN users u ON u.id = c.user_id AND u.role <> 'admin'
       LEFT JOIN teams t ON t.id = u.team_id AND t.season_id = $1
      WHERE sl.season_id = $1
      GROUP BY c.id, c.full_name, c.user_id, u.team_id, t.name
      ORDER BY c.full_name ASC`,
    [sid],
  );
  return res.rows;
}

/** Enrolled account-holders of the active season who are not in any team. */
export async function listUnassigned(
  seasonId?: string,
): Promise<Array<{ id: string; username: string; full_name: string | null }>> {
  const sid = seasonId ?? (await getActiveSeasonId());
  const res = await pool.query<{ id: string; username: string; full_name: string | null }>(
    `SELECT DISTINCT u.id, u.username, c.full_name
       FROM users u
       JOIN children c ON c.user_id = u.id
       JOIN list_members lm ON lm.child_id = c.id
       JOIN season_lists sl ON sl.list_id = lm.list_id
      WHERE sl.season_id = $1 AND u.team_id IS NULL AND u.role <> 'admin'
      ORDER BY c.full_name ASC`,
    [sid],
  );
  return res.rows;
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
    // Keep the distribution snapshot in sync so the kicked child shows up as
    // unassigned and can be placed into another team.
    await clearParticipantTeam(client, teamId, userId);

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
