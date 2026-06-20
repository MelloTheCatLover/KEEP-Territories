import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateLogin } from '../middleware/validate.middleware';

const router = Router();

// Self-registration is disabled: accounts are issued by an admin from the
// roster. Children only sign in with the login + password they were given.
router.post('/login', validateLogin, authController.login);
router.get('/me', authenticate, authController.getMe);

export default router;
