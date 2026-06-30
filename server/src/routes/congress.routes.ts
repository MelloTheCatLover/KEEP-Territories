import { Router } from 'express';
import * as congressController from '../controllers/congress.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/overview', congressController.getOverview);
router.get('/laws', congressController.listLaws);
router.post('/laws', congressController.createLaw);
router.patch('/laws/:id', validateParamId, congressController.setLawStatus);
router.delete('/laws/:id', validateParamId, congressController.deleteLaw);

export default router;
