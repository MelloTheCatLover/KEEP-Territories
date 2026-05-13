import { Router } from 'express';
import * as trophyController from '../controllers/trophy.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', trophyController.list);

export default router;
