import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { signup as signupController, login as loginController } from './auth.controller';

const router = Router();

// POST /api/auth/signup — register a new user
router.post('/signup', asyncHandler(signupController));

// POST /api/auth/login — authenticate and receive a JWT
router.post('/login', asyncHandler(loginController));

export default router;
