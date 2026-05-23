import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { sendError } from '../utils/response';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; role: string };
    }
  }
}

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
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      sendError(res, StatusCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }
    throw err;
  }
}
