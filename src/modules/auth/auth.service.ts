import { pool } from '../../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

/**
 * Registers a new user.
 * Returns the created user row without the password field.
 */
export async function signup(
  name: string,
  email: string,
  password: string,
  role: string
): Promise<SafeUser> {
  // Validate all fields are present and non-empty
  if (!name || !email || !password || !role) {
    throw makeError('name, email, password, and role are all required', 400);
  }

  // Validate role
  if (role !== 'contributor' && role !== 'maintainer') {
    throw makeError("role must be 'contributor' or 'maintainer'", 400);
  }

  // Check for duplicate email
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing.rows.length > 0) {
    throw makeError('Email already in use', 400);
  }

  // Hash password with 10 salt rounds
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user — RETURNING excludes password
  const result = await pool.query<SafeUser>(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, updated_at',
    [name, email, hashedPassword, role]
  );

  return result.rows[0];
}

/**
 * Authenticates a user and returns a signed JWT plus the safe user object.
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  // Validate fields present
  if (!email || !password) {
    throw makeError('email and password are required', 400);
  }

  // Find user by email (include password for comparison)
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
    throw makeError('Invalid credentials', 401);
  }

  const user = result.rows[0];

  // Compare password
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw makeError('Invalid credentials', 401);
  }

  // Sign JWT with id, name, role
  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  // Return token + user without password
  const { password: _pw, ...safeUser } = user;

  return { token, user: safeUser };
}
