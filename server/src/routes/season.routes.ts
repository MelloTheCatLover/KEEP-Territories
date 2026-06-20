import { Router } from 'express';
import * as seasonController from '../controllers/season.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', seasonController.list);
router.post('/', seasonController.create);
router.get('/:id', validateParamId, seasonController.getById);
router.patch('/:id', validateParamId, seasonController.update);
router.put('/:id/lists', validateParamId, seasonController.setLists);
router.post('/:id/activate', validateParamId, seasonController.activate);
router.delete('/:id', validateParamId, seasonController.remove);

export default router;
