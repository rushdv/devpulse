import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createIssue as createIssueController,
  listIssues as listIssuesController,
  getIssueById as getIssueByIdController,
  updateIssue as updateIssueController,
  deleteIssue as deleteIssueController,
} from './issues.controller';

const router = Router();

// Public routes
router.get('/', asyncHandler(listIssuesController));
router.get('/:id', asyncHandler(getIssueByIdController));

// Protected routes
router.post('/', authenticate, asyncHandler(createIssueController));
router.patch('/:id', authenticate, asyncHandler(updateIssueController));
router.delete('/:id', authenticate, authorize('maintainer'), asyncHandler(deleteIssueController));

export default router;
