import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { StatusCodes } from 'http-status-codes';
import authRouter from './modules/auth/auth.router';
import issuesRouter from './modules/issues/issues.router';
import { sendError } from './utils/response';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'DevPulse API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/signup, /api/auth/login',
      issues: '/api/issues',
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  sendError(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
});

export default app;
