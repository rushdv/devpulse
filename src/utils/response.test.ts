import * as fc from 'fast-check';
import { Response } from 'express';
import { sendSuccess, sendError } from './response';

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

const statusCodeArb = fc.integer({ min: 100, max: 599 });
const messageArb = fc.string({ minLength: 1, maxLength: 200 });
const dataArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string()),
  fc.record({ key: fc.string(), value: fc.integer() })
);

describe('sendSuccess', () => {
  it('sets success: true and includes message', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getStatus, getBody } = makeMockRes();
        sendSuccess(res, statusCode, message);
        const body = getBody() as Record<string, unknown>;
        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(true);
        expect(body.message).toBe(message);
        expect('data' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('includes data key when data is provided', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, dataArb, (statusCode, message, data) => {
        const { res, getStatus, getBody } = makeMockRes();
        sendSuccess(res, statusCode, message, data);
        const body = getBody() as Record<string, unknown>;
        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(true);
        expect('data' in body).toBe(true);
        expect(body.data).toEqual(data);
      }),
      { numRuns: 100 }
    );
  });

  it('omits data key when data is undefined', () => {
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

describe('sendError', () => {
  it('sets success: false and includes message', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, (statusCode, message) => {
        const { res, getStatus, getBody } = makeMockRes();
        sendError(res, statusCode, message);
        const body = getBody() as Record<string, unknown>;
        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(false);
        expect(body.message).toBe(message);
        expect('errors' in body).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('includes errors key when errors is provided', () => {
    fc.assert(
      fc.property(statusCodeArb, messageArb, dataArb, (statusCode, message, errors) => {
        const { res, getStatus, getBody } = makeMockRes();
        sendError(res, statusCode, message, errors);
        const body = getBody() as Record<string, unknown>;
        expect(getStatus()).toBe(statusCode);
        expect(body.success).toBe(false);
        expect('errors' in body).toBe(true);
        expect(body.errors).toEqual(errors);
      }),
      { numRuns: 100 }
    );
  });

  it('omits errors key when errors is undefined', () => {
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
