import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { env } from '../config/env';
import { CreateUserDto, LoginDto, User, UserPublic } from '../types/user';
import { JwtPayload, AuthResponse } from '../types/auth';
import { AppError } from '../types/errors';

const SALT_ROUNDS = 12;

function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    team_id: user.team_id,
    team_role: user.team_role,
    role: user.role,
    created_at: user.created_at,
  };
}

function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}

export async function register(dto: CreateUserDto): Promise<AuthResponse> {
  const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
  const code = dto.code?.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingEmail = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [dto.email]
    );
    if (existingEmail.rows.length > 0) {
      throw new AppError(409, 'Email already in use');
    }

    const existingUsername = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [dto.username]
    );
    if (existingUsername.rows.length > 0) {
      throw new AppError(409, 'Username already taken');
    }

    const result = await client.query<User>(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.email, dto.username, passwordHash]
    );
    const user = result.rows[0];

    // Optional roster code: claim the matching unclaimed child entry. A wrong or
    // taken code rolls back the whole registration so accounts stay consistent.
    if (code) {
      const claim = await client.query(
        `UPDATE roster_entries
            SET user_id = $1
          WHERE code = $2 AND user_id IS NULL
        RETURNING id`,
        [user.id, code]
      );
      if (claim.rows.length === 0) {
        throw new AppError(400, 'Неверный код участника или он уже использован');
      }
    }

    await client.query('COMMIT');

    const token = generateToken(user);
    return { user: toUserPublic(user), token };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function login(dto: LoginDto): Promise<AuthResponse> {
  const result = await pool.query<User>(
    'SELECT * FROM users WHERE email = $1',
    [dto.email]
  );

  if (result.rows.length === 0) {
    throw new AppError(401, 'Invalid email or password');
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(dto.password, user.password_hash);

  if (!isValid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = generateToken(user);

  return { user: toUserPublic(user), token };
}

export async function getUserById(id: string): Promise<UserPublic> {
  const result = await pool.query<User>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  return toUserPublic(result.rows[0]);
}
