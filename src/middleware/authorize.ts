import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { sendError } from '../utils/response';

/**
 * Factory function that returns an Express middleware enforcing role-based access control.
 * If req.user is absent or req.user.role is not in the allowed roles list,
 * responds with 403 Forbidden. Otherwise calls next().
 */
export const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendError(res, StatusCodes.FORBIDDEN, 'Forbidden');
      return;
    }
    next();
  };
