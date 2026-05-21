/**
 * Property-based tests for auth.service.ts
 * Feature: devpulse
 *
 * Uses fast-check to verify universal correctness properties.
 * All tests mock pool.query to avoid requiring a live database.
 */

import * as fc from 'fast-check';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Set JWT_SECRET before importing the service
process.env.JWT_SECRET = 'test-secret';
// Provide a dummy DATABASE_URL so db.ts doesn't throw at import time
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock the db module so pool.query is controllable
jest.mock('../../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { pool } from '../../config/db';
import { signup, login } from './auth.service';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arbitrary for a valid role */
const validRole = fc.constantFrom('contributor', 'maintainer');

/** Arbitrary for a non-empty string (trimmed, no whitespace-only) */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0
);

/** Arbitrary for a plausible email */
const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]+$/.test(s))
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

/** Arbitrary for a valid user input (name, email, password, role) */
const validUserInput = fc.record({
  name: nonEmptyString,
  email: emailArb,
  password: nonEmptyString,
  role: validRole,
});

// Use bcrypt cost factor 1 in tests for speed
const TEST_BCRYPT_ROUNDS = 1;

// ---------------------------------------------------------------------------
// Property 1: Password never appears in responses
// Validates: Requirements 1.1, 2.1, 13.1
// ---------------------------------------------------------------------------
describe('Property 1: Password never appears in responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'signup() returned object has no password field',
    async () => {
      await fc.assert(
        fc.asyncProperty(validUserInput, async ({ name, email, password, role }) => {
          mockQuery.mockReset();
          // Mock: no existing user (SELECT returns empty), INSERT returns safe user
          mockQuery
            .mockResolvedValueOnce({ rows: [] }) // SELECT (duplicate check)
            .mockResolvedValueOnce({
              rows: [
                {
                  id: 1,
                  name,
                  email,
                  role,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            }); // INSERT RETURNING

          const result = await signup(name, email, password, role);

          expect(result).not.toHaveProperty('password');
        }),
        { numRuns: 100 }
      );
    },
    60000
  );

  it(
    'login() returned user object has no password field',
    async () => {
      await fc.assert(
        fc.asyncProperty(validUserInput, async ({ name, email, password, role }) => {
          mockQuery.mockReset();
          const hashedPw = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);

          // Mock: user found with hashed password
          mockQuery.mockResolvedValueOnce({
            rows: [
              {
                id: 1,
                name,
                email,
                password: hashedPw,
                role,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          });

          const result = await login(email, password);

          expect(result.user).not.toHaveProperty('password');
        }),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 2: Registered user password is stored as bcrypt hash
// Validates: Requirements 1.4, 13.2
// ---------------------------------------------------------------------------
describe('Property 2: Registered user password is stored as bcrypt hash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'INSERT receives a bcrypt hash, not the plaintext password',
    async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyString, async (password) => {
          let capturedParams: unknown[] = [];

          mockQuery.mockReset();
          mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
            if (typeof sql === 'string' && sql.startsWith('SELECT id FROM users')) {
              return { rows: [] }; // no duplicate
            }
            if (typeof sql === 'string' && sql.startsWith('INSERT')) {
              capturedParams = params;
              return {
                rows: [
                  {
                    id: 1,
                    name: 'Test',
                    email: 'test@test.com',
                    role: 'contributor',
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                ],
              };
            }
            return { rows: [] };
          });

          await signup('Test', 'test@test.com', password, 'contributor');

          // capturedParams[2] is the hashed password (name=$1, email=$2, password=$3, role=$4)
          const storedPassword = capturedParams[2] as string;

          // Must be a bcrypt hash
          expect(storedPassword).toMatch(/^\$2b\$/);
          // Must NOT equal the plaintext
          expect(storedPassword).not.toBe(password);
          // bcrypt.compare must resolve to true
          const matches = await bcrypt.compare(password, storedPassword);
          expect(matches).toBe(true);
        }),
        { numRuns: 100 }
      );
    },
    120000
  );
});

// ---------------------------------------------------------------------------
// Property 3: Invalid role values are rejected
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------
describe('Property 3: Invalid role values are rejected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'signup() throws 400 for any role that is not contributor or maintainer',
    async () => {
      const invalidRole = fc.string().filter(
        (s) => s !== 'contributor' && s !== 'maintainer'
      );

      await fc.assert(
        fc.asyncProperty(invalidRole, async (role) => {
          let thrownError: unknown;
          try {
            await signup('Test', 'test@test.com', 'password123', role);
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).toBeDefined();
          expect((thrownError as { statusCode: number }).statusCode).toBe(400);
        }),
        { numRuns: 100 }
      );
    },
    30000
  );
});

// ---------------------------------------------------------------------------
// Property 4: JWT payload contains required fields
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------
describe('Property 4: JWT payload contains required fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'login() returns a JWT whose payload contains id, name, and role matching the user',
    async () => {
      const userRecord = fc.record({
        id: fc.integer({ min: 1, max: 99999 }),
        name: nonEmptyString,
        email: emailArb,
        role: validRole,
      });

      await fc.assert(
        fc.asyncProperty(userRecord, nonEmptyString, async (user, plainPassword) => {
          mockQuery.mockReset();
          const hashedPw = await bcrypt.hash(plainPassword, TEST_BCRYPT_ROUNDS);

          mockQuery.mockResolvedValueOnce({
            rows: [
              {
                id: user.id,
                name: user.name,
                email: user.email,
                password: hashedPw,
                role: user.role,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          });

          const result = await login(user.email, plainPassword);

          const decoded = jwt.verify(result.token, process.env.JWT_SECRET!) as {
            id: number;
            name: string;
            role: string;
          };

          expect(String(decoded.id)).toBe(String(user.id));
          expect(decoded.name).toBe(user.name);
          expect(decoded.role).toBe(user.role);
        }),
        { numRuns: 100 }
      );
    },
    120000
  );
});
