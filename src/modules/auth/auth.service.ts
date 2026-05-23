import { pool } from '../../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';

interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

interface LoginResult {
  token: string;
  user: SafeUser;
}

function makeError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function signup(
  name: string,
  email: string,
  password: string,
  role: string
): Promise<SafeUser> {
  if (!name || !email || !password || !role) {
    throw makeError('name, email, password, and role are all required', StatusCodes.BAD_REQUEST);
  }

  if (role !== 'contributor' && role !== 'maintainer') {
    throw makeError("role must be 'contributor' or 'maintainer'", StatusCodes.BAD_REQUEST);
  }

  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing.rows.length > 0) {
    throw makeError('Email already in use', StatusCodes.BAD_REQUEST);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await pool.query<SafeUser>(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, updated_at',
    [name, email, hashedPassword, role]
  );

  return result.rows[0];
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    throw makeError('email and password are required', StatusCodes.BAD_REQUEST);
  }

  const result = await pool.query<{
    id: number;
    name: string;
    email: string;
    password: string;
    role: string;
    created_at: Date;
    updated_at: Date;
  }>('SELECT id, name, email, password, role, created_at, updated_at FROM users WHERE email = $1', [email]);

  if (result.rows.length === 0) {
    throw makeError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  const user = result.rows[0];

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw makeError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  const { password: _pw, ...safeUser } = user;
  return { token, user: safeUser };
}
