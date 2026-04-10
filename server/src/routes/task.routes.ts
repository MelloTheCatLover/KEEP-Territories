import { Router } from 'express';
import * as taskController from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.post('/', taskController.create);
router.get('/', taskController.getAll);
router.get('/:id', validateParamId, taskController.getById);
router.put('/:id', validateParamId, taskController.update);
router.delete('/:id', validateParamId, taskController.remove);

export default router;
