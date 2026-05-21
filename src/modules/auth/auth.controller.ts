import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as authService from './auth.service';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * POST /api/auth/signup
 * Registers a new user.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const { name, email, password, role } = req.body;

  try {
    const user = await authService.signup(name, email, password, role);
    sendSuccess(res, StatusCodes.CREATED, 'User registered successfully', user);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  try {
    const { token, user } = await authService.login(email, password);
    sendSuccess(res, StatusCodes.OK, 'Login successful', { token, user });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}
