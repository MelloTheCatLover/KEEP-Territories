import { Router } from 'express';
import * as sectorController from '../controllers/sector.controller';
import * as mapGeneratorController from '../controllers/map-generator.controller';
import * as submissionController from '../controllers/submission.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.post('/generate-map', requireAdmin, mapGeneratorController.generateMap);
router.delete('/all', requireAdmin, mapGeneratorController.deleteAll);
router.get('/admin/status', requireAdmin, mapGeneratorController.getStatus);

router.post('/', sectorController.create);
router.post('/bulk', sectorController.createBulk);
router.get('/', sectorController.getAll);
router.get('/map', sectorController.getMap);
router.get('/:id', validateParamId, sectorController.getById);

router.post('/:sectorId/action/start', submissionController.startAction);

export default router;
