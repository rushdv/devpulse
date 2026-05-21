/**
 * Property-based tests for src/middleware/authorize.ts
 *
 * Feature: devpulse, Property 5: Authorize middleware enforces role restrictions
 *
 * Validates: Requirements 4.1, 4.2, 13.5
 */

import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { authorize } from './authorize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock of Express Response that captures status and json calls.
 */
function makeMockRes(): {
  res: Response;
  getStatus: () => number | undefined;
  getBody: () => unknown;
} {
  let capturedStatus: number | undefined;
  let capturedBody: unknown;

  const jsonFn = jest.fn((body: unknown) => {
    capturedBody = body;
    return mockRes;
  });

  const statusFn = jest.fn((code: number) => {
    capturedStatus = code;
    return { json: jsonFn };
  });

  const mockRes = { status: statusFn } as unknown as Response;

  return {
    res: mockRes,
    getStatus: () => capturedStatus,
    getBody: () => capturedBody,
  };
}

/**
 * Builds a mock Request with req.user set to the given role.
 */
function makeReqWithRole(role: string): Request {
  return { user: { id: 'test-id', name: 'Test User', role } } as unknown as Request;
}

/**
 * Builds a mock Request with no req.user (unauthenticated).
 */
function makeReqWithoutUser(): Request {
  return {} as unknown as Request;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a non-empty role string (printable ASCII, no whitespace-only strings).
 * We use fc.string with a filter to ensure the role is non-empty.
 */
const roleArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

/**
 * Generates an array of 1–5 distinct role strings.
 */
const rolesArrayArb = fc
  .array(roleArb, { minLength: 1, maxLength: 5 })
  .map((arr) => [...new Set(arr)]) // deduplicate
  .filter((arr) => arr.length >= 1);

// ---------------------------------------------------------------------------
// Property 5: Authorize middleware enforces role restrictions
// Validates: Requirements 4.1, 4.2, 13.5
// ---------------------------------------------------------------------------

describe('Property 5: Authorize middleware enforces role restrictions', () => {
  /**
   * When req.user.role is NOT in the allowed roles list, the middleware
   * SHALL return a 403 Forbidden response and NOT call next().
   */
  it('returns 403 when user role is not in the allowed roles list', () => {
    fc.assert(
      fc.property(roleArb, rolesArrayArb, (userRole, allowedRoles) => {
        // Ensure the user's role is definitely not in the allowed list
        const filteredAllowed = allowedRoles.filter((r) => r !== userRole);
        // If filtering removed everything, use a fixed role that differs
        const allowed = filteredAllowed.length > 0 ? filteredAllowed : ['__other__'];

        const req = makeReqWithRole(userRole);
        const { res, getStatus, getBody } = makeMockRes();
        const next = jest.fn() as unknown as NextFunction;

        authorize(...allowed)(req, res, next);

        expect(getStatus()).toBe(403);
        expect((getBody() as Record<string, unknown>).success).toBe(false);
        expect((getBody() as Record<string, unknown>).message).toBe('Forbidden');
        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * When req.user.role IS in the allowed roles list, the middleware
   * SHALL call next() and NOT send any response.
   */
  it('calls next() when user role is in the allowed roles list', () => {
    fc.assert(
      fc.property(roleArb, rolesArrayArb, (userRole, extraRoles) => {
        // Ensure the user's role is in the allowed list
        const allowed = [...new Set([userRole, ...extraRoles])];

        const req = makeReqWithRole(userRole);
        const { res, getStatus } = makeMockRes();
        const next = jest.fn() as unknown as NextFunction;

        authorize(...allowed)(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(getStatus()).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * When req.user is absent (unauthenticated), the middleware
   * SHALL return a 403 Forbidden response regardless of allowed roles.
   */
  it('returns 403 when req.user is absent', () => {
    fc.assert(
      fc.property(rolesArrayArb, (allowedRoles) => {
        const req = makeReqWithoutUser();
        const { res, getStatus, getBody } = makeMockRes();
        const next = jest.fn() as unknown as NextFunction;

        authorize(...allowedRoles)(req, res, next);

        expect(getStatus()).toBe(403);
        expect((getBody() as Record<string, unknown>).success).toBe(false);
        expect((getBody() as Record<string, unknown>).message).toBe('Forbidden');
        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
