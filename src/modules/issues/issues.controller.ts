import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as issuesService from './issues.service';
import { sendSuccess, sendError } from '../../utils/response';

export async function createIssue(req: Request, res: Response): Promise<void> {
  const { title, description, type } = req.body as {
    title: string;
    description: string;
    type: string;
  };
  const reporterId = req.user!.id;
  try {
    const issue = await issuesService.createIssue(reporterId, title, description, type);
    sendSuccess(res, StatusCodes.CREATED, 'Issue created successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

export async function listIssues(req: Request, res: Response): Promise<void> {
  const { sort, type, status } = req.query as {
    sort?: string;
    type?: string;
    status?: string;
  };
  try {
    const issues = await issuesService.listIssues(sort, type, status);
    sendSuccess(res, StatusCodes.OK, 'Issues retrieved successfully', issues);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

export async function getIssueById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const issue = await issuesService.getIssueById(id);
    sendSuccess(res, StatusCodes.OK, 'Issue retrieved successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

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
    sendSuccess(res, StatusCodes.OK, 'Issue updated successfully', issue);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}

export async function deleteIssue(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    await issuesService.deleteIssue(id);
    sendSuccess(res, StatusCodes.OK, 'Issue deleted successfully');
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    sendError(res, statusCode, message);
  }
}
