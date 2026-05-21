import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler';

// Feature: devpulse, Property 13: asyncHandler forwards all rejections to next()

/**
 * Validates: Requirements 11.1, 11.2
 *
 * Property 13: asyncHandler forwards all rejections to next()
 * For any async route handler that throws or rejects, the asyncHandler wrapper
 * SHALL call next(error) with the thrown value and SHALL NOT allow the process to crash.
 */
describe('asyncHandler', () => {
  const mockReq = {} as Request;
  const mockRes = {} as Response;

  describe('Property 13: asyncHandler forwards all rejections to next()', () => {
    it('forwards arbitrary Error objects to next()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 100 }),
          async (message) => {
            const error = new Error(message);
            const next = jest.fn() as unknown as NextFunction;

            const handler = asyncHandler(async (_req, _res, _next) => {
              throw error;
            });

            await Promise.resolve(handler(mockReq, mockRes, next));
            // Allow microtasks to flush
            await new Promise((resolve) => setImmediate(resolve));

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(error);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('forwards arbitrary string rejections to next()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 200 }),
          async (errorValue) => {
            const next = jest.fn() as unknown as NextFunction;

            const handler = asyncHandler(async (_req, _res, _next) => {
              return Promise.reject(errorValue);
            });

            await Promise.resolve(handler(mockReq, mockRes, next));
            await new Promise((resolve) => setImmediate(resolve));

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(errorValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('forwards arbitrary number rejections to next()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.integer(), fc.float(), fc.double()),
          async (errorValue) => {
            const next = jest.fn() as unknown as NextFunction;

            const handler = asyncHandler(async (_req, _res, _next) => {
              return Promise.reject(errorValue);
            });

            await Promise.resolve(handler(mockReq, mockRes, next));
            await new Promise((resolve) => setImmediate(resolve));

            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(errorValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('forwards arbitrary mixed-type rejections to next() and never calls next with a different value', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.record({ code: fc.integer(), message: fc.string() })
          ),
          async (errorValue) => {
            const next = jest.fn() as unknown as NextFunction;

            const handler = asyncHandler(async (_req, _res, _next) => {
              return Promise.reject(errorValue);
            });

            await Promise.resolve(handler(mockReq, mockRes, next));
            await new Promise((resolve) => setImmediate(resolve));

            // next must be called exactly once
            expect(next).toHaveBeenCalledTimes(1);
            // next must be called with the exact error value — not a different value
            expect(next).toHaveBeenCalledWith(errorValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not call next() when the handler resolves successfully', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(undefined), async () => {
          const next = jest.fn() as unknown as NextFunction;

          const handler = asyncHandler(async (_req, _res, _next) => {
            // resolves without error
          });

          await Promise.resolve(handler(mockReq, mockRes, next));
          await new Promise((resolve) => setImmediate(resolve));

          expect(next).not.toHaveBeenCalled();
        }),
        { numRuns: 100 }
      );
    });
  });
});
