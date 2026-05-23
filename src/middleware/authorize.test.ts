import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { authorize } from './authorize';

function makeMockRes() {
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

function makeReqWithRole(role: string): Request {
  return { user: { id: 'test-id', name: 'Test User', role } } as unknown as Request;
}

function makeReqWithoutUser(): Request {
  return {} as unknown as Request;
}

const roleArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

const rolesArrayArb = fc
  .array(roleArb, { minLength: 1, maxLength: 5 })
  .map((arr) => [...new Set(arr)])
  .filter((arr) => arr.length >= 1);

describe('authorize middleware', () => {
  it('returns 403 when user role is not in the allowed roles list', () => {
    fc.assert(
      fc.property(roleArb, rolesArrayArb, (userRole, allowedRoles) => {
        const filteredAllowed = allowedRoles.filter((r) => r !== userRole);
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

  it('calls next() when user role is in the allowed roles list', () => {
    fc.assert(
      fc.property(roleArb, rolesArrayArb, (userRole, extraRoles) => {
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
