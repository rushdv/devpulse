import { Request, Response } from 'express';
import * as issuesService from './issues.service';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * POST /api/issues
 * Creates a new issue. Requires authentication.
 */
export async function createIssue(req: Request, res: Response): Promise<void> {
  const { title, description, type } = req.body as {
    title: string;
    description: string;
    type: string;
  };
  const reporterId = req.user!.id;

  try {
    const issue = await issuesService.createIssue(reporterId, title, description, type);
    sendSuccess(res, 201, 'Issue created successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

/**
 * GET /api/issues
 * Lists all issues with optional filtering and sorting. Public.
 */
export async function listIssues(req: Request, res: Response): Promise<void> {
  const { sort, type, status } = req.query as {
    sort?: string;
    type?: string;
    status?: string;
  };

  try {
    const issues = await issuesService.listIssues(sort, type, status);
    sendSuccess(res, 200, 'Issues retrieved successfully', issues);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

/**
 * GET /api/issues/:id
 * Retrieves a single issue by ID. Public.
 */
export async function getIssueById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const issue = await issuesService.getIssueById(id);
    sendSuccess(res, 200, 'Issue retrieved successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

/**
 * PATCH /api/issues/:id
 * Updates an issue's title, description, and/or type.
 * Maintainers can also update status.
 * Requires authentication.
 */
export async function updateIssue(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { title, description, type, status } = req.body as {
    title?: string;
    description?: string;
    type?: string;
    status?: string;
  };
  const requesterId = req.user!.id;
  const requesterRole = req.user!.role;

  try {
    const issue = await issuesService.updateIssue(id, requesterId, requesterRole, {
      title,
      description,
      type,
      status,
    });
    sendSuccess(res, 200, 'Issue updated successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

/**
 * DELETE /api/issues/:id
 * Deletes an issue. Requires authentication and maintainer role.
 */
export async function deleteIssue(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    await issuesService.deleteIssue(id);
    sendSuccess(res, 200, 'Issue deleted successfully');
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}
