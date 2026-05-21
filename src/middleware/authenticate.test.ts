/**
 * Tests for authenticate middleware
 * Feature: devpulse, Property 5 (partial): authenticate middleware attaches decoded payload
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 13.4
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as fc from 'fast-check';
import { authenticate } from './authenticate';

const TEST_SECRET = 'test-secret';

// Helper to build a minimal mock Request
function mockRequest(authorization?: string): Request {
  return {
    headers: authorization !== undefined ? { authorization } : {},
  } as unknown as Request;
}

// Helper to build a mock Response with chainable status().json()
function mockResponse(): { res: Response; statusCode: number | null; body: unknown } {
  const ctx: { statusCode: number | null; body: unknown } = {
    statusCode: null,
    body: null,
  };
  const json = jest.fn((b: unknown) => {
    ctx.body = b;
    return res;
  });
  const status = jest.fn((code: number) => {
    ctx.statusCode = code;
    return { json };
  });
  const res = { status } as unknown as Response;
  return { res, ...ctx };
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe('authenticate middleware — unit tests', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('calls next() and sets req.user when token is valid', () => {
    const payload = { id: 'user-1', name: 'Alice', role: 'contributor' };
    const token = jwt.sign(payload, TEST_SECRET);
    const req = mockRequest(token);
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject(payload);
  });

  it('returns 401 when Authorization header is absent', () => {
    const req = mockRequest(undefined);
    const { res, statusCode } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // statusCode is set via the mock
    const statusMock = (res.status as jest.Mock);
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('returns 401 when Authorization header is an empty string', () => {
    const req = mockRequest('');
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is invalid (JsonWebTokenError)', () => {
    const req = mockRequest('not.a.valid.token');
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is expired (TokenExpiredError)', () => {
    const payload = { id: 'user-1', name: 'Alice', role: 'contributor' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: -1 });
    const req = mockRequest(token);
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });
});

// ─── Property-based test ─────────────────────────────────────────────────────

/**
 * Property 5 (partial): authenticate middleware attaches decoded payload
 *
 * For any arbitrary { id, name, role } payload, signing it with the test
 * JWT_SECRET and passing the token to the middleware must result in req.user
 * being set to an object matching the original payload.
 *
 * Validates: Requirements 3.3
 */
describe('authenticate middleware — property tests', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it(
    'Property 5 (partial): valid JWT always sets req.user to the decoded payload — Validates: Requirements 3.3',
    () => {
      fc.assert(
        fc.property(
          // Generate arbitrary { id, name, role } payloads
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 64 }),
            name: fc.string({ minLength: 1, maxLength: 64 }),
            role: fc.string({ minLength: 1, maxLength: 32 }),
          }),
          (payload) => {
            const token = jwt.sign(payload, TEST_SECRET);
            const req = mockRequest(token);
            const { res } = mockResponse();
            const next = jest.fn() as NextFunction;

            authenticate(req, res, next);

            // next() must have been called exactly once
            expect(next).toHaveBeenCalledTimes(1);

            // req.user must match the generated payload
            expect(req.user).toBeDefined();
            expect(req.user!.id).toBe(payload.id);
            expect(req.user!.name).toBe(payload.name);
            expect(req.user!.role).toBe(payload.role);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
