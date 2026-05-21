import { Request, Response } from 'express';
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
    sendSuccess(res, 201, 'User registered successfully', user);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
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
    sendSuccess(res, 200, 'Login successful', { token, user });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}
