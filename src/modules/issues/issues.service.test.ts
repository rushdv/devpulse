/**
 * Property-based tests for issues.service.ts
 * Feature: devpulse
 *
 * Uses fast-check to verify universal correctness properties.
 * All tests mock pool.query to avoid requiring a live database.
 */

import * as fc from 'fast-check';

// Set env vars before importing anything that touches db.ts
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';

// Mock the db module so pool.query is controllable
jest.mock('../../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { pool } from '../../config/db';
import {
  createIssue,
  listIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
} from './issues.service';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid title: 1–150 characters, non-empty */
const validTitle = fc
  .string({ minLength: 1, maxLength: 150 })
  .filter((s) => s.trim().length > 0);

/** Valid description: at least 20 characters */
const validDescription = fc.string({ minLength: 20, maxLength: 500 });

/** Valid issue type */
const validType = fc.constantFrom('bug', 'feature_request');

/** Valid issue status */
const validStatus = fc.constantFrom('open', 'in_progress', 'resolved');

/** UUID-like string */
const uuidArb = fc.uuid();

/** A fixed reporter UUID used in many tests */
const FIXED_REPORTER_ID = '00000000-0000-0000-0000-000000000001';

/** Build a fake IssueRow */
function makeIssueRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '00000000-0000-0000-0000-000000000099',
    title: 'Sample issue title',
    description: 'This is a sample description that is long enough.',
    type: 'bug',
    status: 'open',
    reporter_id: FIXED_REPORTER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/** Build a fake Reporter row */
function makeReporterRow(id: string = FIXED_REPORTER_ID): Record<string, unknown> {
  return { id, name: 'Test User', role: 'contributor' };
}

// ---------------------------------------------------------------------------
// Property 6: New issues always have status `open`
// Validates: Requirements 5.7
// ---------------------------------------------------------------------------
describe('Property 6: New issues always have status `open`', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'createIssue() returns an issue with status === "open" for any valid input',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          validTitle,
          validDescription,
          validType,
          async (title, description, type) => {
            mockQuery.mockReset();

            // First call: SELECT id FROM users (reporter exists)
            mockQuery.mockResolvedValueOnce({ rows: [{ id: FIXED_REPORTER_ID }] });
            // Second call: INSERT RETURNING * — return a row with status 'open'
            const issueRow = makeIssueRow({ title, description, type, status: 'open' });
            mockQuery.mockResolvedValueOnce({ rows: [issueRow] });

            const result = await createIssue(FIXED_REPORTER_ID, title, description, type);

            expect(result.status).toBe('open');
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 7: reporter_id is always set from authenticated user
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
describe('Property 7: reporter_id is always set from authenticated user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'createIssue() passes the provided reporterId as the 4th INSERT parameter',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          validTitle,
          validDescription,
          validType,
          async (reporterId, title, description, type) => {
            let capturedInsertParams: unknown[] = [];

            mockQuery.mockReset();
            mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
              if (typeof sql === 'string' && sql.includes('SELECT id FROM users')) {
                return { rows: [{ id: reporterId }] };
              }
              if (typeof sql === 'string' && sql.includes('INSERT INTO issues')) {
                capturedInsertParams = params;
                return {
                  rows: [
                    makeIssueRow({
                      title,
                      description,
                      type,
                      reporter_id: reporterId,
                    }),
                  ],
                };
              }
              return { rows: [] };
            });

            await createIssue(reporterId, title, description, type);

            // The INSERT params are ($1=title, $2=description, $3=type, $4=reporter_id)
            expect(capturedInsertParams[3]).toBe(reporterId);
          }
        ),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 8: Invalid issue type values are rejected
// Validates: Requirements 5.5, 8.7
// ---------------------------------------------------------------------------
describe('Property 8: Invalid issue type values are rejected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'createIssue() throws 400 for any type that is not "bug" or "feature_request"',
    async () => {
      const invalidType = fc
        .string()
        .filter((s) => s !== 'bug' && s !== 'feature_request');

      await fc.assert(
        fc.asyncProperty(invalidType, async (type) => {
          let thrownError: any;
          try {
            await createIssue(
              FIXED_REPORTER_ID,
              'Valid title',
              'This description is long enough to pass validation.',
              type
            );
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).toBeDefined();
          expect(thrownError.statusCode).toBe(400);
        }),
        { numRuns: 100 }
      );
    },
    30000
  );

  it(
    'updateIssue() throws 400 for any type that is not "bug" or "feature_request"',
    async () => {
      const invalidType = fc
        .string()
        .filter((s) => s !== 'bug' && s !== 'feature_request');

      await fc.assert(
        fc.asyncProperty(invalidType, async (type) => {
          mockQuery.mockReset();
          // Mock: issue exists (SELECT)
          mockQuery.mockResolvedValueOnce({
            rows: [makeIssueRow({ status: 'open', reporter_id: FIXED_REPORTER_ID })],
          });

          let thrownError: any;
          try {
            await updateIssue(
              '00000000-0000-0000-0000-000000000099',
              FIXED_REPORTER_ID,
              'maintainer',
              { type }
            );
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).toBeDefined();
          expect(thrownError.statusCode).toBe(400);
        }),
        { numRuns: 100 }
      );
    },
    30000
  );
});

// ---------------------------------------------------------------------------
// Property 9: Issue list always includes reporter object
// Validates: Requirements 6.1
// ---------------------------------------------------------------------------
describe('Property 9: Issue list always includes reporter object', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'listIssues() returns issues each with a reporter object containing id, name, and role',
    async () => {
      // Generate arrays of 1–10 issues with associated reporter data
      const issueArrayArb = fc
        .array(
          fc.record({
            reporterId: uuidArb,
            title: validTitle,
            description: validDescription,
            type: validType,
            status: validStatus,
          }),
          { minLength: 1, maxLength: 10 }
        );

      await fc.assert(
        fc.asyncProperty(issueArrayArb, async (issueInputs) => {
          mockQuery.mockReset();

          // Build issue rows and reporter rows
          const issueRows = issueInputs.map((input, idx) => ({
            id: `00000000-0000-0000-0000-${String(idx).padStart(12, '0')}`,
            title: input.title,
            description: input.description,
            type: input.type,
            status: input.status,
            reporter_id: input.reporterId,
            created_at: new Date(),
            updated_at: new Date(),
          }));

          const distinctReporterIds = [...new Set(issueInputs.map((i) => i.reporterId))];
          const reporterRows = distinctReporterIds.map((id) => ({
            id,
            name: `Reporter ${id.slice(0, 8)}`,
            role: 'contributor',
          }));

          // First call: SELECT * FROM issues
          mockQuery.mockResolvedValueOnce({ rows: issueRows });
          // Second call: SELECT id, name, role FROM users WHERE id = ANY(...)
          mockQuery.mockResolvedValueOnce({ rows: reporterRows });

          const results = await listIssues();

          expect(results.length).toBe(issueRows.length);
          for (const issue of results) {
            expect(issue).toHaveProperty('reporter');
            expect(issue.reporter).toHaveProperty('id');
            expect(issue.reporter).toHaveProperty('name');
            expect(issue.reporter).toHaveProperty('role');
            expect(issue).not.toHaveProperty('reporter_id');
          }
        }),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 10: Type and status filters return only matching issues
// Validates: Requirements 6.3, 6.4
// ---------------------------------------------------------------------------
describe('Property 10: Type and status filters return only matching issues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'listIssues(undefined, type) returns only issues matching the type filter',
    async () => {
      await fc.assert(
        fc.asyncProperty(validType, async (filterType) => {
          mockQuery.mockReset();

          // The mock simulates the DB already filtering — the service trusts the DB result
          // but we verify the WHERE clause is built correctly by checking the query params
          let capturedSql = '';
          let capturedParams: unknown[] = [];

          mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
            if (typeof sql === 'string' && sql.includes('FROM issues')) {
              capturedSql = sql;
              capturedParams = params;
              // Return issues that match the filter
              return {
                rows: [
                  makeIssueRow({ type: filterType, reporter_id: FIXED_REPORTER_ID }),
                ],
              };
            }
            // Reporter query
            return { rows: [makeReporterRow(FIXED_REPORTER_ID)] };
          });

          const results = await listIssues(undefined, filterType);

          // Verify the SQL contains a type filter
          expect(capturedSql).toContain('type =');
          // Verify the filter value is in the params
          expect(capturedParams).toContain(filterType);
          // Verify every returned issue matches the filter
          for (const issue of results) {
            expect(issue.type).toBe(filterType);
          }
        }),
        { numRuns: 100 }
      );
    },
    60000
  );

  it(
    'listIssues(undefined, undefined, status) returns only issues matching the status filter',
    async () => {
      await fc.assert(
        fc.asyncProperty(validStatus, async (filterStatus) => {
          mockQuery.mockReset();

          let capturedSql = '';
          let capturedParams: unknown[] = [];

          mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
            if (typeof sql === 'string' && sql.includes('FROM issues')) {
              capturedSql = sql;
              capturedParams = params;
              return {
                rows: [
                  makeIssueRow({ status: filterStatus, reporter_id: FIXED_REPORTER_ID }),
                ],
              };
            }
            return { rows: [makeReporterRow(FIXED_REPORTER_ID)] };
          });

          const results = await listIssues(undefined, undefined, filterStatus);

          // Verify the SQL contains a status filter
          expect(capturedSql).toContain('status =');
          // Verify the filter value is in the params
          expect(capturedParams).toContain(filterStatus);
          // Verify every returned issue matches the filter
          for (const issue of results) {
            expect(issue.status).toBe(filterStatus);
          }
        }),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 11: Update cannot change status or reporter_id
// Validates: Requirements 8.5
// ---------------------------------------------------------------------------
describe('Property 11: Update cannot change status or reporter_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'updateIssue() does not include status or reporter_id in the UPDATE SQL parameters',
    async () => {
      // Generate update payloads that include status and/or reporter_id
      const payloadWithForbiddenFields = fc.record({
        status: validStatus,
        reporter_id: uuidArb,
        title: fc.option(validTitle, { nil: undefined }),
        description: fc.option(validDescription, { nil: undefined }),
        type: fc.option(validType, { nil: undefined }),
      });

      const ISSUE_ID = '00000000-0000-0000-0000-000000000099';
      const MAINTAINER_ID = '00000000-0000-0000-0000-000000000002';

      await fc.assert(
        fc.asyncProperty(payloadWithForbiddenFields, async (updates) => {
          let capturedUpdateSql = '';
          let capturedUpdateParams: unknown[] = [];

          mockQuery.mockReset();
          mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
            if (typeof sql === 'string' && sql.startsWith('SELECT * FROM issues')) {
              return {
                rows: [
                  makeIssueRow({
                    id: ISSUE_ID,
                    status: 'open',
                    reporter_id: FIXED_REPORTER_ID,
                  }),
                ],
              };
            }
            if (typeof sql === 'string' && sql.startsWith('UPDATE issues')) {
              capturedUpdateSql = sql;
              capturedUpdateParams = params;
              return {
                rows: [
                  makeIssueRow({
                    id: ISSUE_ID,
                    title: updates.title ?? 'Sample issue title',
                    description: updates.description ?? 'This is a sample description that is long enough.',
                    type: updates.type ?? 'bug',
                    status: 'open', // status unchanged
                    reporter_id: FIXED_REPORTER_ID, // reporter_id unchanged
                  }),
                ],
              };
            }
            // Reporter query
            return { rows: [makeReporterRow(FIXED_REPORTER_ID)] };
          });

          await updateIssue(ISSUE_ID, MAINTAINER_ID, 'maintainer', updates);

          // The UPDATE params must NOT contain the attempted status or reporter_id values
          // (they should have been stripped before building the SET clause)
          expect(capturedUpdateParams).not.toContain(updates.status);
          expect(capturedUpdateParams).not.toContain(updates.reporter_id);
        }),
        { numRuns: 100 }
      );
    },
    60000
  );
});

// ---------------------------------------------------------------------------
// Property 12: Contributors cannot update issues they do not own
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------
describe('Property 12: Contributors cannot update issues they do not own', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    'updateIssue() throws 403 when contributor requesterId !== issue reporter_id',
    async () => {
      // Generate two different UUIDs: one for the contributor, one for the issue reporter
      const differentIds = fc
        .tuple(uuidArb, uuidArb)
        .filter(([contributorId, reporterId]) => contributorId !== reporterId);

      await fc.assert(
        fc.asyncProperty(differentIds, async ([contributorId, reporterId]) => {
          mockQuery.mockReset();
          // Mock: issue exists with a different reporter_id
          mockQuery.mockResolvedValueOnce({
            rows: [
              makeIssueRow({
                status: 'open',
                reporter_id: reporterId,
              }),
            ],
          });

          let thrownError: any;
          try {
            await updateIssue(
              '00000000-0000-0000-0000-000000000099',
              contributorId,
              'contributor',
              { title: 'New title that is valid' }
            );
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).toBeDefined();
          expect(thrownError.statusCode).toBe(403);
        }),
        { numRuns: 100 }
      );
    },
    30000
  );
});
