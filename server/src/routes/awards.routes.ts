import { Router } from 'express';
import * as proportionalAwardController from '../controllers/proportional-award.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

router.use(authenticate);

router.post('/proportional', requireAdmin, proportionalAwardController.applyProportional);

export default router;
