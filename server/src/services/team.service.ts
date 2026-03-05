import { pool } from '../config/db';
import { Team, CreateTeamDto, TeamWithMembers } from '../types/team';
import { UserPublic } from '../types/user';
import { AppError } from '../types/errors';

export async function create(dto: CreateTeamDto, userId: string): Promise<TeamWithMembers> {
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

    const teamResult = await client.query<Team>(
      `INSERT INTO teams (name, influence, experience, strength, intelligence, endurance, leadership, luck)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [dto.name, dto.influence, dto.experience, dto.strength, dto.intelligence, dto.endurance, dto.leadership, dto.luck]
    );
    const team = teamResult.rows[0];

    await client.query(
      `UPDATE users SET team_id = $1, team_role = 'captain' WHERE id = $2`,
      [team.id, userId]
    );

    const memberResult = await client.query<UserPublic>(
      `SELECT id, email, username, team_id, team_role, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    return { ...team, members: memberResult.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getById(teamId: string): Promise<TeamWithMembers> {
  const teamResult = await pool.query<Team>(
    'SELECT * FROM teams WHERE id = $1',
    [teamId]
  );
  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }

  const membersResult = await pool.query<UserPublic>(
    `SELECT id, email, username, team_id, team_role, created_at
     FROM users WHERE team_id = $1`,
    [teamId]
  );

  return { ...teamResult.rows[0], members: membersResult.rows };
}

export async function join(teamId: string, userId: string): Promise<TeamWithMembers> {
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

export async function transferCaptain(currentUserId: string, newCaptainId: string): Promise<void> {
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
