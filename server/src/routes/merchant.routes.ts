import { Router } from 'express';
import * as merchantController from '../controllers/merchant.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

// Merchants are hidden from teams; the whole feature is admin-only.
router.get('/sectors', merchantController.listSectors);
router.post('/tokens/:id/spend', validateParamId, merchantController.spendToken);

export default router;
