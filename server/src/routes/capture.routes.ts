import { Router } from 'express';
import * as captureController from '../controllers/capture.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/:sectorId/capture/start', captureController.startCapture);
router.get('/:sectorId/capture/task', captureController.getTask);
router.post('/:sectorId/capture/submit', captureController.submitAnswer);
router.post('/:sectorId/capture/cancel', captureController.cancelCapture);

export default router;
