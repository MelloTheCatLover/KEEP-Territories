import { Router } from 'express';
import * as taskController from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/', taskController.getAll);
router.get('/:id', validateParamId, taskController.getById);
router.post('/', requireAdmin, taskController.create);
router.put('/:id', requireAdmin, validateParamId, taskController.update);
router.delete('/:id', requireAdmin, validateParamId, taskController.remove);

export default router;
