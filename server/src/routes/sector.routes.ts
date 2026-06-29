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
router.get('/admin/task-bindings', requireAdmin, sectorController.getBindings);

router.post('/', requireAdmin, sectorController.create);
router.post('/bulk', requireAdmin, sectorController.createBulk);
router.get('/', sectorController.getAll);
router.get('/map', sectorController.getMap);
router.get('/:id', validateParamId, sectorController.getById);

// Participants are observers: only admins drive the field. Reads stay open.
router.post('/:sectorId/action/start', requireAdmin, submissionController.startAction);
router.get('/:sectorId/submission/current', submissionController.getCurrentForSector);

router.get('/:id/tasks', requireAdmin, validateParamId, sectorController.listSectorTasks);
router.post('/:id/tasks', requireAdmin, validateParamId, sectorController.attachSectorTask);
router.delete('/:id/tasks/:taskId', requireAdmin, validateParamId, sectorController.detachSectorTask);

export default router;
