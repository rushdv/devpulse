/**
 * Property-based tests for src/utils/response.ts
 *
 * Feature: devpulse
 * Property 14: sendSuccess always produces correct response shape
 * Property 15: sendError always produces correct response shape
 *
 * Validates: Requirements 10.1, 10.2
 */

import * as fc from 'fast-check';
import { Response } from 'express';
import { sendSuccess, sendError } from './response';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock of Express Response that captures the arguments
 * passed to res.status(code).json(body).
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

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** HTTP status codes in the valid 100–599 range */
const statusCodeArb = fc.integer({ min: 100, max: 599 });

/** Arbitrary non-empty strings for messages */
const messageArb = fc.string({ minLength: 1, maxLength: 200 });

/** Arbitrary data values: primitives, arrays, objects, null */
const dataArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string()),
  fc.record({ key: fc.string(), value: fc.integer() })
);

// ---------------------------------------------------------------------------
// Property 14: sendSuccess always produces correct response shape
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------

describe('Property 14: sendSuccess always produces correct response shape', () => {
  it('should always set success: true and include message', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getStatus, getBody } = makeMockRes();

        sendSuccess(res, statusCode, message);

        const body = getBody() as Record<string, unknown>;

        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(true);
        expect(body.message).toBe(message);
        // data key must be absent when not provided
        expect('data' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should include data key when data is provided', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, dataArb, (statusCode, message, data) => {
        const { res, getStatus, getBody } = makeMockRes();

        sendSuccess(res, statusCode, message, data);

        const body = getBody() as Record<string, unknown>;

        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(true);
        expect(body.message).toBe(message);
        expect('data' in body).toBe(true);
        expect(body.data).toEqual(data);
      }),
      { numRuns: 100 }
    );
  });

  it('should omit data key when data is explicitly undefined', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getBody } = makeMockRes();

        sendSuccess(res, statusCode, message, undefined);

        const body = getBody() as Record<string, unknown>;

        expect(body.success).toBe(true);
        expect('data' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: sendError always produces correct response shape
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------

describe('Property 15: sendError always produces correct response shape', () => {
  it('should always set success: false and include message', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getStatus, getBody } = makeMockRes();

        sendError(res, statusCode, message);

        const body = getBody() as Record<string, unknown>;

        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(false);
        expect(body.message).toBe(message);
        // errors key must be absent when not provided
        expect('errors' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should include errors key when errors is provided', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, dataArb, (statusCode, message, errors) => {
        const { res, getStatus, getBody } = makeMockRes();

        sendError(res, statusCode, message, errors);

        const body = getBody() as Record<string, unknown>;

        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(false);
        expect(body.message).toBe(message);
        expect('errors' in body).toBe(true);
        expect(body.errors).toEqual(errors);
      }),
      { numRuns: 100 }
    );
  });

  it('should omit errors key when errors is explicitly undefined', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getBody } = makeMockRes();

        sendError(res, statusCode, message, undefined);

        const body = getBody() as Record<string, unknown>;

        expect(body.success).toBe(false);
        expect('errors' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
