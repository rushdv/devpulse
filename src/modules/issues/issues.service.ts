import { pool } from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

const VALID_TYPES = ['bug', 'feature_request'] as const;
const VALID_STATUSES = ['open', 'in_progress', 'resolved'] as const;

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

/**
 * Creates a new issue.
 * reporter_id is always taken from the authenticated user — never from the request body.
 */
export async function createIssue(
  reporterId: string,
  title: string,
  description: string,
  type: string
): Promise<IssueRow> {
  // Validate title
  if (!title || title.length > 150) {
    throw makeError('title is required and must be at most 150 characters', 400);
  }

  // Validate description
  if (!description || description.length < 20) {
    throw makeError('description is required and must be at least 20 characters', 400);
  }

  // Validate type
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw makeError("type must be 'bug' or 'feature_request'", 400);
  }

  // Verify reporter exists in application logic (no FK constraint in DB)
  const reporterCheck = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE id = $1',
    [reporterId]
  );
  if (reporterCheck.rows.length === 0) {
    throw makeError('Reporter not found', 400);
  }

  // Insert issue — status defaults to 'open' via DB default
  const result = await pool.query<IssueRow>(
    'INSERT INTO issues (title, description, type, reporter_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, type, reporterId]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// listIssues
// ---------------------------------------------------------------------------

/**
 * Lists all issues with optional filtering and sorting.
 * Fetches reporter data in a separate query and merges in application code (no JOINs).
 */
export async function listIssues(
  sort?: string,
  type?: string,
  status?: string
): Promise<IssueWithReporter[]> {
  // Validate type if provided
  if (type !== undefined && !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw makeError("type must be 'bug' or 'feature_request'", 400);
  }

  // Validate status if provided
  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    throw makeError("status must be 'open', 'in_progress', or 'resolved'", 400);
  }

  // Build parameterized WHERE clause dynamically
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

  if (issues.length === 0) {
    return [];
  }

  // Collect distinct reporter_id values
  const reporterIds = [...new Set(issues.map((i) => i.reporter_id))];

  // Fetch reporter data in a single separate query (no JOINs)
  const reportersResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = ANY($1::int[])',
    [reporterIds]
  );

  // Build Map<id, Reporter> and merge into each issue
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

// ---------------------------------------------------------------------------
// getIssueById
// ---------------------------------------------------------------------------

/**
 * Fetches a single issue by ID, with reporter merged in (no JOINs).
 */
export async function getIssueById(id: string): Promise<IssueWithReporter> {
  const issueResult = await pool.query<IssueRow>(
    'SELECT * FROM issues WHERE id = $1',
    [id]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', 404);
  }

  const issue = issueResult.rows[0];

  // Fetch reporter in a separate query
  const reporterResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = $1',
    [issue.reporter_id]
  );

  const reporter = reporterResult.rows[0] ?? { id: issue.reporter_id, name: '', role: '' };

  const { reporter_id, ...rest } = issue;
  return { ...rest, reporter };
}

// ---------------------------------------------------------------------------
// updateIssue
// ---------------------------------------------------------------------------

/**
 * Updates an issue's title, description, and/or type.
 * Maintainers can also update status independently.
 * Enforces authorization rules for contributors vs maintainers.
 */
export async function updateIssue(
  issueId: string,
  requesterId: string,
  requesterRole: string,
  updates: UpdateFields
): Promise<IssueWithReporter> {
  // Fetch the issue first (404 if not found — takes precedence over 403/409)
  const issueResult = await pool.query<IssueRow>(
    'SELECT * FROM issues WHERE id = $1',
    [issueId]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', 404);
  }

  const issue = issueResult.rows[0];

  // Authorization check
  if (requesterRole === 'contributor') {
    if (String(issue.reporter_id) !== String(requesterId)) {
      throw makeError('Forbidden', 403);
    }
    if (issue.status !== 'open') {
      throw makeError('Issue cannot be updated because it is not open', 409);
    }
  }

  // Strip reporter_id from updates (never updatable)
  const { reporter_id: _reporterId, ...safeUpdates } = updates;

  // Contributors cannot change status — strip it from their updates
  if (requesterRole === 'contributor') {
    delete safeUpdates.status;
  }

  // Validate status if maintainer is updating it
  if (safeUpdates.status !== undefined) {
    if (!VALID_STATUSES.includes(safeUpdates.status as (typeof VALID_STATUSES)[number])) {
      throw makeError("status must be 'open', 'in_progress', or 'resolved'", 400);
    }
  }

  // Validate title if provided
  if (safeUpdates.title !== undefined) {
    if (!safeUpdates.title || (safeUpdates.title as string).length > 150) {
      throw makeError('title must be at most 150 characters', 400);
    }
  }

  // Validate description if provided
  if (safeUpdates.description !== undefined) {
    if (!safeUpdates.description || (safeUpdates.description as string).length < 20) {
      throw makeError('description must be at least 20 characters', 400);
    }
  }

  // Validate type if provided
  if (safeUpdates.type !== undefined) {
    if (!VALID_TYPES.includes(safeUpdates.type as (typeof VALID_TYPES)[number])) {
      throw makeError("type must be 'bug' or 'feature_request'", 400);
    }
  }

  // Build SET clause dynamically for only the provided fields
  const allowedFields = ['title', 'description', 'type', 'status'] as const;
  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (safeUpdates[field] !== undefined) {
      params.push(safeUpdates[field]);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  // Always update updated_at
  setClauses.push(`updated_at = NOW()`);

  params.push(issueId);
  const updateSql = `UPDATE issues SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;

  const updateResult = await pool.query<IssueRow>(updateSql, params);
  const updatedIssue = updateResult.rows[0];

  // Fetch reporter separately (no JOINs)
  const reporterResult = await pool.query<Reporter>(
    'SELECT id, name, role FROM users WHERE id = $1',
    [updatedIssue.reporter_id]
  );

  const reporter = reporterResult.rows[0] ?? {
    id: updatedIssue.reporter_id,
    name: '',
    role: '',
  };

  const { reporter_id, ...rest } = updatedIssue;
  return { ...rest, reporter };
}

// ---------------------------------------------------------------------------
// deleteIssue
// ---------------------------------------------------------------------------

/**
 * Deletes an issue by ID. Maintainer only (enforced at router level).
 */
export async function deleteIssue(
  issueId: string
): Promise<{ success: true; message: string }> {
  // Verify issue exists
  const issueResult = await pool.query<IssueRow>(
    'SELECT id FROM issues WHERE id = $1',
    [issueId]
  );

  if (issueResult.rows.length === 0) {
    throw makeError('Issue not found', 404);
  }

  await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);

  return { success: true, message: 'Issue deleted successfully' };
}
