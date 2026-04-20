import { pool } from '../config/db';
import { Team, CreateTeamDto } from '../types/team';
import { TeamFullStats } from '../types/team-stats';
import { AppError } from '../types/errors';
import * as teamStatsService from './team-stats.service';

export async function create(dto: CreateTeamDto, userId: string): Promise<TeamFullStats> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

    const nameCheck = await client.query(
      'SELECT id FROM teams WHERE name = $1',
      [dto.name]
    );
    if (nameCheck.rows.length > 0) {
      throw new AppError(400, 'Team with this name already exists');
    }

    const sectorResult = await client.query<{
      id: string;
      is_home_base: boolean;
      status: string;
      home_team_id: string | null;
    }>(
      `SELECT id, is_home_base, status, home_team_id
       FROM sectors
       WHERE id = $1
       FOR UPDATE`,
      [dto.home_sector_id]
    );
    if (sectorResult.rows.length === 0) {
      throw new AppError(404, 'Home sector not found');
    }
    const sector = sectorResult.rows[0];
    if (!sector.is_home_base) {
      throw new AppError(400, 'Selected sector is not a home base');
    }
    if (sector.home_team_id || sector.status !== 'free') {
      throw new AppError(409, 'Home sector is already taken');
    }

    const teamResult = await client.query<Team>(
      `INSERT INTO teams (name, color)
       VALUES ($1, $2)
       RETURNING *`,
      [dto.name, dto.color ?? null]
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

    const teamCheck = await client.query(
      'SELECT id FROM teams WHERE id = $1',
      [teamId]
    );
    if (teamCheck.rows.length === 0) {
      throw new AppError(404, 'Team not found');
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

export async function getAll(): Promise<Team[]> {
  const result = await pool.query<Team>('SELECT * FROM teams ORDER BY created_at DESC');
  return result.rows;
}
