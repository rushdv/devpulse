import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as fc from 'fast-check';
import { authenticate } from './authenticate';

const TEST_SECRET = 'test-secret';

function mockRequest(authorization?: string): Request {
  return {
    headers: authorization !== undefined ? { authorization } : {},
  } as unknown as Request;
}

function mockResponse() {
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
  return { res, ctx };
}

describe('authenticate middleware', () => {
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
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('returns 401 when Authorization header is an empty string', () => {
    const req = mockRequest('');
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is invalid', () => {
    const req = mockRequest('not.a.valid.token');
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is expired', () => {
    const payload = { id: 'user-1', name: 'Alice', role: 'contributor' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: -1 });
    const req = mockRequest(token);
    const { res } = mockResponse();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
  });

  it('valid JWT always sets req.user to the decoded payload', () => {
    fc.assert(
      fc.property(
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

          expect(next).toHaveBeenCalledTimes(1);
          expect(req.user).toBeDefined();
          expect(req.user!.id).toBe(payload.id);
          expect(req.user!.name).toBe(payload.name);
          expect(req.user!.role).toBe(payload.role);
        }
      ),
      { numRuns: 100 }
    );
  });
});
