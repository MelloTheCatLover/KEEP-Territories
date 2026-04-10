import { Router } from 'express';
import * as teamStatsController from '../controllers/team-stats.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', teamStatsController.getStats);
router.post('/upgrade', teamStatsController.upgradeStat);

export default router;
