import { Router } from 'express';
import * as diversionController from '../controllers/diversion.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
// Диверсант скрыт от команд, как и остальные персонажи: кидает админ.
router.use(requireAdmin);

router.get('/catalog', diversionController.getCatalog);
router.get('/', diversionController.list);
router.post('/', diversionController.cast);
router.post('/:id/cancel', validateParamId, diversionController.cancel);

export default router;
