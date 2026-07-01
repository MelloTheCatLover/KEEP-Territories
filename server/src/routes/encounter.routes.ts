import { Router } from 'express';
import * as encounterController from '../controllers/encounter.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/pool', encounterController.getPool);
router.patch('/pool/:number', encounterController.setActive);
router.patch('/pool/:number/target', encounterController.setTarget);
router.get('/pending', encounterController.getPending);
router.post('/:id/resolve', validateParamId, encounterController.resolve);

export default router;
