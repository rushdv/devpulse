import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { sendError } from '../utils/response';

// Extend Express Request interface to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; role: string };
    }
  }
}

/**
 * Middleware that verifies the JWT from the Authorization header.
 * The token is expected as a raw value (no "Bearer" prefix).
 * On success, attaches the decoded payload to req.user and calls next().
 * On failure, responds with 401 Unauthorized.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization;

  if (!token) {
    sendError(res, StatusCodes.UNAUTHORIZED, 'Unauthorized');
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      name: string;
      role: string;
    };
    req.user = { id: String(decoded.id), name: decoded.name, role: decoded.role };
    next();
  } catch (err) {
    if (
      err instanceof jwt.JsonWebTokenError ||
      err instanceof jwt.TokenExpiredError
    ) {
      sendError(res, StatusCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }
    throw err;
  }
}
