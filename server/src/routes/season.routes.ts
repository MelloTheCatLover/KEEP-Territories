import { Router } from 'express';
import * as seasonController from '../controllers/season.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Any authenticated user can browse all seasons (overview screen). Mutations
// stay admin-only.
router.get('/', seasonController.list);

// Public archive views: any authenticated user (even non-participants) can browse
// a season's trophies and ownership timelapse.
router.get('/:id/trophies', validateParamId, seasonController.getTrophies);
router.get('/:id/timelapse', validateParamId, seasonController.getTimelapse);
router.get('/:id/finals', validateParamId, seasonController.getFinals);

router.post('/', requireAdmin, seasonController.create);
router.get('/:id', requireAdmin, validateParamId, seasonController.getById);
router.patch('/:id', requireAdmin, validateParamId, seasonController.update);
router.put('/:id/lists', requireAdmin, validateParamId, seasonController.setLists);
router.post('/:id/activate', requireAdmin, validateParamId, seasonController.activate);
router.post('/:id/archive', requireAdmin, validateParamId, seasonController.archive);
router.put('/:id/mvp', requireAdmin, validateParamId, seasonController.setMvp);
router.delete('/:id', requireAdmin, validateParamId, seasonController.remove);

export default router;
