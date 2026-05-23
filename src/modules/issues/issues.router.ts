import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createIssue,
  listIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
} from './issues.controller';

const router = Router();

router.get('/', asyncHandler(listIssues));
router.get('/:id', asyncHandler(getIssueById));
router.post('/', authenticate, asyncHandler(createIssue));
router.patch('/:id', authenticate, asyncHandler(updateIssue));
router.delete('/:id', authenticate, authorize('maintainer'), asyncHandler(deleteIssue));

export default router;
