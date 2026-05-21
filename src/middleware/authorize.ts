import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

/**
 * Factory function that returns an Express middleware enforcing role-based access control.
 * If req.user is absent or req.user.role is not in the allowed roles list,
 * responds with 403 Forbidden. Otherwise calls next().
 *
 * Requirements: 4.1, 4.2, 4.3, 13.5
 */
export const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendError(res, 403, 'Forbidden');
      return;
    }
    next();
  };
