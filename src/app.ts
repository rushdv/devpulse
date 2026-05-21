import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { StatusCodes } from 'http-status-codes';
import authRouter from './modules/auth/auth.router';
import issuesRouter from './modules/issues/issues.router';
import { sendError } from './utils/response';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);

// Global error handler — must have 4 parameters for Express to recognize it as an error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  sendError(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
});

export default app;
