import * as fc from 'fast-check';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));

import { pool } from '../../config/db';
import { signup, login } from './auth.service';

const mockQuery = pool.query as jest.Mock;

const validRole = fc.constantFrom('contributor', 'maintainer');
const nonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]+$/.test(s))
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

const validUserInput = fc.record({
  name: nonEmptyString,
  email: emailArb,
  password: nonEmptyString,
  role: validRole,
});

const TEST_BCRYPT_ROUNDS = 1;

describe('signup', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returned object never contains password field', async () => {
    await fc.assert(
      fc.asyncProperty(validUserInput, async ({ name, email, password, role }) => {
        mockQuery.mockReset();
        mockQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{ id: 1, name, email, role, created_at: new Date(), updated_at: new Date() }],
          });

        const result = await signup(name, email, password, role);
        expect(result).not.toHaveProperty('password');
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('stores bcrypt hash, not plaintext password', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyString, async (password) => {
        let capturedParams: unknown[] = [];

        mockQuery.mockReset();
        mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
          if (sql.startsWith('SELECT id FROM users')) return { rows: [] };
          if (sql.startsWith('INSERT')) {
            capturedParams = params;
            return {
              rows: [{ id: 1, name: 'Test', email: 'test@test.com', role: 'contributor', created_at: new Date(), updated_at: new Date() }],
            };
          }
          return { rows: [] };
        });

        await signup('Test', 'test@test.com', password, 'contributor');

        const storedPassword = capturedParams[2] as string;
        expect(storedPassword).toMatch(/^\$2b\$/);
        expect(storedPassword).not.toBe(password);
        expect(await bcrypt.compare(password, storedPassword)).toBe(true);
      }),
      { numRuns: 100 }
    );
  }, 120000);

  it('throws 400 for invalid role', async () => {
    const invalidRole = fc.string().filter((s) => s !== 'contributor' && s !== 'maintainer');

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
  }, 30000);
});

describe('login', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returned user object never contains password field', async () => {
    await fc.assert(
      fc.asyncProperty(validUserInput, async ({ name, email, password, role }) => {
        mockQuery.mockReset();
        const hashedPw = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 1, name, email, password: hashedPw, role, created_at: new Date(), updated_at: new Date() }],
        });

        const result = await login(email, password);
        expect(result.user).not.toHaveProperty('password');
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('JWT payload contains id, name, and role', async () => {
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
          rows: [{ id: user.id, name: user.name, email: user.email, password: hashedPw, role: user.role, created_at: new Date(), updated_at: new Date() }],
        });

        const result = await login(user.email, plainPassword);
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET!) as { id: number; name: string; role: string };

        expect(String(decoded.id)).toBe(String(user.id));
        expect(decoded.name).toBe(user.name);
        expect(decoded.role).toBe(user.role);
      }),
      { numRuns: 100 }
    );
  }, 120000);
});
