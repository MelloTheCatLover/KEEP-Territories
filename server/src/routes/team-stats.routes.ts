import { Router } from 'express';
import * as teamStatsController from '../controllers/team-stats.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', teamStatsController.getStats);
router.post('/upgrade', teamStatsController.upgradeStat);
router.put('/admin/resources', requireAdmin, teamStatsController.adminSetResources);
router.put('/admin/stats', requireAdmin, teamStatsController.adminSetStats);

export default router;
