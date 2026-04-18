import { Router } from 'express';
import * as difficultyController from '../controllers/difficulty.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', difficultyController.getAll);

export default router;
