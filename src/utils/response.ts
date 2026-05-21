import { Response } from 'express';

/**
 * Sends a standardized success response.
 * Shape: { success: true, message: string, data?: any }
 * The `data` key is omitted entirely when not provided.
 */
export function sendSuccess(
  res: Response,
  statusCode: number,
  message: string,
  data?: unknown
): void {
  const body: { success: true; message: string; data?: unknown } = {
    success: true,
    message,
  };

  if (data !== undefined) {
    body.data = data;
  }

  res.status(statusCode).json(body);
}

/**
 * Sends a standardized error response.
 * Shape: { success: false, message: string, errors?: any }
 * The `errors` key is omitted entirely when not provided.
 */
export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors?: unknown
): void {
  const body: { success: false; message: string; errors?: unknown } = {
    success: false,
    message,
  };

  if (errors !== undefined) {
    body.errors = errors;
  }

  res.status(statusCode).json(body);
}
