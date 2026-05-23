import { pool } from '../../config/db';
import { StatusCodes } from 'http-status-codes';

interface Reporter {
  id: number;
  name: string;
  role: string;
}

interface IssueRow {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  reporter_id: number;
  created_at: Date;
  updated_at: Date;
}

interface IssueWithReporter extends Omit<IssueRow, 'reporter_id'> {
  reporter: Reporter;
}

interface UpdateFields {
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  reporter_id?: string | number;
  [key: string]: unknown;
}

function makeError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

const VALID_TYPES = ['bug', 'feature_request'] as const;
const VALID_STATUSES = ['open', 'in_progress', 'resolved'] as const;

export async function createIssue(
  reporterId: string,
  title: string,
  description: string,
  type: string
): Promise<IssueRow> {
  if (!title || title.length > 150) {
    throw makeError('title is required and must be at most 150 characters', StatusCodes.BAD_REQUEST);
  }
  if (!description || description.length < 20) {
    throw makeError('description is required and must be at least 20 characters', StatusCodes.BAD_REQUEST);
  }
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw makeError("type must be 'bug' or 'feature_request'", StatusCodes.BAD_REQUEST);
  }

  const reporterCheck = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE id = $1',
    [reporterId]
  );
  if (reporterCheck.rows.length === 0) {
    throw makeError('Reporter not found', StatusCodes.BAD_REQUEST);
  }

  const result = await pool.query<IssueRow>(
    'INSERT INTO issues (title, description, type, reporter_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, type, reporterId]
  );

  return result.rows[0];
}

export async function listIssues(
  sort?: string,
  type?: string,
  status?: string
): Promise<IssueWithReporter[]> {
  if (type !== undefined && !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw makeError("type must be 'bug' or 'feature_request'", StatusCodes.BAD_REQUEST);
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    throw makeError("status must be 'open', 'in_progress', or 'resolved'", StatusCodes.BAD_REQUEST);
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = sort === 'oldest' ? 'ASC' : 'DESC';
  const sql = `SELECT * FROM issues ${where} ORDER BY created_at ${order}`;

  const issuesResult = await pool.query<IssueRow>(sql, params);
  const issues = issuesResult.rows;

  if (issues.length === 0) return [];

  const reporterIds = [...new Set(issues.map((i) => i.reporter_id))];

  const reportersResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = ANY($1::int[])',
    [reporterIds]
  );

  const reporterMap = new Map<number, Reporter>();
  for (const reporter of reportersResult.rows) {
    reporterMap.set(reporter.id, reporter);
  }

  return issues.map((issue) => {
    const { reporter_id, ...rest } = issue;
    return {
      ...rest,
      reporter: reporterMap.get(reporter_id) ?? { id: reporter_id, name: '', role: '' },
    };
  });
}

export async function getIssueById(id: string): Promise<IssueWithReporter> {
  const issueResult = await pool.query<IssueRow>(
    'SELECT * FROM issues WHERE id = $1',
    [id]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', StatusCodes.NOT_FOUND);
  }

  const issue = issueResult.rows[0];

  const reporterResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = $1',
    [issue.reporter_id]
  );

  const reporter = reporterResult.rows[0] ?? { id: issue.reporter_id, name: '', role: '' };
  const { reporter_id, ...rest } = issue;
  return { ...rest, reporter };
}

export async function updateIssue(
  issueId: string,
  requesterId: string,
  requesterRole: string,
  updates: UpdateFields
): Promise<IssueWithReporter> {
  const issueResult = await pool.query<IssueRow>(
    'SELECT * FROM issues WHERE id = $1',
    [issueId]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', StatusCodes.NOT_FOUND);
  }

  const issue = issueResult.rows[0];

  if (requesterRole === 'contributor') {
    if (String(issue.reporter_id) !== String(requesterId)) {
      throw makeError('Forbidden', StatusCodes.FORBIDDEN);
    }
    if (issue.status !== 'open') {
      throw makeError('Issue cannot be updated because it is not open', StatusCodes.CONFLICT);
    }
  }

  const { reporter_id: _rid, ...safeUpdates } = updates;

  if (requesterRole === 'contributor') {
    delete safeUpdates.status;
  }

  if (safeUpdates.status !== undefined) {
    if (!VALID_STATUSES.includes(safeUpdates.status as (typeof VALID_STATUSES)[number])) {
      throw makeError("status must be 'open', 'in_progress', or 'resolved'", StatusCodes.BAD_REQUEST);
    }
  }
  if (safeUpdates.title !== undefined) {
    if (!safeUpdates.title || (safeUpdates.title as string).length > 150) {
      throw makeError('title must be at most 150 characters', StatusCodes.BAD_REQUEST);
    }
  }
  if (safeUpdates.description !== undefined) {
    if (!safeUpdates.description || (safeUpdates.description as string).length < 20) {
      throw makeError('description must be at least 20 characters', StatusCodes.BAD_REQUEST);
    }
  }
  if (safeUpdates.type !== undefined) {
    if (!VALID_TYPES.includes(safeUpdates.type as (typeof VALID_TYPES)[number])) {
      throw makeError("type must be 'bug' or 'feature_request'", StatusCodes.BAD_REQUEST);
    }
  }

  const allowedFields = ['title', 'description', 'type', 'status'] as const;
  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (safeUpdates[field] !== undefined) {
      params.push(safeUpdates[field]);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(issueId);

  const updateSql = `UPDATE issues SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
  const updateResult = await pool.query<IssueRow>(updateSql, params);
  const updatedIssue = updateResult.rows[0];

  const reporterResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = $1',
    [updatedIssue.reporter_id]
  );

  const reporter = reporterResult.rows[0] ?? { id: updatedIssue.reporter_id, name: '', role: '' };
  const { reporter_id, ...rest } = updatedIssue;
  return { ...rest, reporter };
}

export async function deleteIssue(issueId: string): Promise<void> {
  const issueResult = await pool.query<IssueRow>(
    'SELECT id FROM issues WHERE id = $1',
    [issueId]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', StatusCodes.NOT_FOUND);
  }

  await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
}
