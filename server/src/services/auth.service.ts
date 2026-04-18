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
  const existingEmail = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [dto.email]
  );
  if (existingEmail.rows.length > 0) {
    throw new AppError(409, 'Email already in use');
  }

  const existingUsername = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [dto.username]
  );
  if (existingUsername.rows.length > 0) {
    throw new AppError(409, 'Username already taken');
  }

  const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

  const result = await pool.query<User>(
    `INSERT INTO users (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [dto.email, dto.username, passwordHash]
  );

  const user = result.rows[0];
  const token = generateToken(user);

  return { user: toUserPublic(user), token };
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
