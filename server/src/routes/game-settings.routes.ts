import { Router } from 'express';
import * as gameSettingsController from '../controllers/game-settings.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', gameSettingsController.getAll);
router.put('/', gameSettingsController.update);

export default router;
