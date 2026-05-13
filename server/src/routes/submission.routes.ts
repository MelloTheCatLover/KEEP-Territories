import { Router } from 'express';
import * as submissionController from '../controllers/submission.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.get('/pending', requireAdmin, submissionController.listPending);
router.post('/:id/approve', requireAdmin, validateParamId, submissionController.approve);
router.post('/:id/reject', requireAdmin, validateParamId, submissionController.reject);
router.post('/:id/drop', validateParamId, submissionController.dropPending);

export default router;
