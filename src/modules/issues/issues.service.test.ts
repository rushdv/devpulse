import * as fc from 'fast-check';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';

jest.mock('../../config/db', () => ({
  pool: { query: jest.fn() },
}));

import { pool } from '../../config/db';
import { createIssue, listIssues, updateIssue } from './issues.service';

const mockQuery = pool.query as jest.Mock;

const validTitle = fc.string({ minLength: 1, maxLength: 150 }).filter((s) => s.trim().length > 0);
const validDescription = fc.string({ minLength: 20, maxLength: 500 });
const validType = fc.constantFrom('bug', 'feature_request');
const validStatus = fc.constantFrom('open', 'in_progress', 'resolved');
const uuidArb = fc.uuid();

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';

function makeIssueRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '00000000-0000-0000-0000-000000000099',
    title: 'Sample issue title',
    description: 'This is a sample description that is long enough.',
    type: 'bug',
    status: 'open',
    reporter_id: REPORTER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeReporterRow(id: string = REPORTER_ID): Record<string, unknown> {
  return { id, name: 'Test User', role: 'contributor' };
}

describe('createIssue', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('new issues always have status open', async () => {
    await fc.assert(
      fc.asyncProperty(validTitle, validDescription, validType, async (title, description, type) => {
        mockQuery.mockReset();
        mockQuery.mockResolvedValueOnce({ rows: [{ id: REPORTER_ID }] });
        mockQuery.mockResolvedValueOnce({ rows: [makeIssueRow({ title, description, type, status: 'open' })] });

        const result = await createIssue(REPORTER_ID, title, description, type);
        expect(result.status).toBe('open');
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('passes reporterId as the 4th INSERT parameter', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, validTitle, validDescription, validType, async (reporterId, title, description, type) => {
        let capturedParams: unknown[] = [];

        mockQuery.mockReset();
        mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
          if (sql.includes('SELECT id FROM users')) return { rows: [{ id: reporterId }] };
          if (sql.includes('INSERT INTO issues')) {
            capturedParams = params;
            return { rows: [makeIssueRow({ title, description, type, reporter_id: reporterId })] };
          }
          return { rows: [] };
        });

        await createIssue(reporterId, title, description, type);
        expect(capturedParams[3]).toBe(reporterId);
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('throws 400 for invalid type', async () => {
    const invalidType = fc.string().filter((s) => s !== 'bug' && s !== 'feature_request');

    await fc.assert(
      fc.asyncProperty(invalidType, async (type) => {
        let err: unknown;
        try {
          await createIssue(REPORTER_ID, 'Valid title', 'This description is long enough to pass.', type);
        } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect((err as { statusCode: number }).statusCode).toBe(400);
      }),
      { numRuns: 100 }
    );
  }, 30000);
});

describe('listIssues', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('each issue includes a reporter object', async () => {
    const issueArrayArb = fc.array(
      fc.record({ reporterId: uuidArb, title: validTitle, description: validDescription, type: validType, status: validStatus }),
      { minLength: 1, maxLength: 10 }
    );

    await fc.assert(
      fc.asyncProperty(issueArrayArb, async (inputs) => {
        mockQuery.mockReset();

        const issueRows = inputs.map((input, idx) => ({
          id: `00000000-0000-0000-0000-${String(idx).padStart(12, '0')}`,
          title: input.title,
          description: input.description,
          type: input.type,
          status: input.status,
          reporter_id: input.reporterId,
          created_at: new Date(),
          updated_at: new Date(),
        }));

        const distinctIds = [...new Set(inputs.map((i) => i.reporterId))];
        const reporterRows = distinctIds.map((id) => ({ id, name: `Reporter`, role: 'contributor' }));

        mockQuery.mockResolvedValueOnce({ rows: issueRows });
        mockQuery.mockResolvedValueOnce({ rows: reporterRows });

        const results = await listIssues();
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
  }, 60000);
});

describe('updateIssue', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('throws 403 when contributor tries to update another user\'s issue', async () => {
    const differentIds = fc.tuple(uuidArb, uuidArb).filter(([a, b]) => a !== b);

    await fc.assert(
      fc.asyncProperty(differentIds, async ([contributorId, reporterId]) => {
        mockQuery.mockReset();
        mockQuery.mockResolvedValueOnce({ rows: [makeIssueRow({ status: 'open', reporter_id: reporterId })] });

        let err: unknown;
        try {
          await updateIssue('00000000-0000-0000-0000-000000000099', contributorId, 'contributor', { title: 'New valid title here' });
        } catch (e) { err = e; }

        expect(err).toBeDefined();
        expect((err as { statusCode: number }).statusCode).toBe(403);
      }),
      { numRuns: 100 }
    );
  }, 30000);
});
