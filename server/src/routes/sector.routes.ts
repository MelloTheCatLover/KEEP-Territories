import { Router } from 'express';
import * as sectorController from '../controllers/sector.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.post('/', sectorController.create);
router.post('/bulk', sectorController.createBulk);
router.get('/', sectorController.getAll);
router.get('/map', sectorController.getMap);
router.get('/:id', validateParamId, sectorController.getById);

export default router;
