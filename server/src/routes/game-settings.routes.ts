import { Router } from 'express';
import * as gameSettingsController from '../controllers/game-settings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

router.use(authenticate);

router.get('/', gameSettingsController.getAll);
router.put('/', requireAdmin, gameSettingsController.update);
router.put('/reward-boost', requireAdmin, gameSettingsController.setRewardBoost);

export default router;
