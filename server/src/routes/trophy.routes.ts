import { Router } from 'express';
import * as trophyController from '../controllers/trophy.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
// Кубки видны всем участникам вживую — рейтинги открыты по ходу игры.
router.get('/', trophyController.list);

export default router;
