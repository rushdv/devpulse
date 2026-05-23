import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler';

describe('asyncHandler', () => {
  const mockReq = {} as Request;
  const mockRes = {} as Response;

  it('forwards Error objects to next()', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 100 }),
        async (message) => {
          const error = new Error(message);
          const next = jest.fn() as unknown as NextFunction;

          const handler = asyncHandler(async () => { throw error; });
          await Promise.resolve(handler(mockReq, mockRes, next));
          await new Promise((resolve) => setImmediate(resolve));

          expect(next).toHaveBeenCalledTimes(1);
          expect(next).toHaveBeenCalledWith(error);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('forwards string rejections to next()', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 200 }),
        async (errorValue) => {
          const next = jest.fn() as unknown as NextFunction;

          const handler = asyncHandler(async () => { return Promise.reject(errorValue); });
          await Promise.resolve(handler(mockReq, mockRes, next));
          await new Promise((resolve) => setImmediate(resolve));

          expect(next).toHaveBeenCalledTimes(1);
          expect(next).toHaveBeenCalledWith(errorValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('forwards mixed-type rejections to next()', async () => {
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

          const handler = asyncHandler(async () => { return Promise.reject(errorValue); });
          await Promise.resolve(handler(mockReq, mockRes, next));
          await new Promise((resolve) => setImmediate(resolve));

          expect(next).toHaveBeenCalledTimes(1);
          expect(next).toHaveBeenCalledWith(errorValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not call next() when handler resolves successfully', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const next = jest.fn() as unknown as NextFunction;

        const handler = asyncHandler(async () => { /* resolves */ });
        await Promise.resolve(handler(mockReq, mockRes, next));
        await new Promise((resolve) => setImmediate(resolve));

        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
