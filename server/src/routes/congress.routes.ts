import { Router } from 'express';
import * as congressController from '../controllers/congress.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Participant-facing: decided laws only, available to any authenticated user.
router.get('/public-laws', congressController.listPublicLaws);

router.use(requireAdmin);

router.get('/overview', congressController.getOverview);
router.get('/laws', congressController.listLaws);
router.post('/laws', congressController.createLaw);
router.patch('/laws/:id', validateParamId, congressController.setLawStatus);
router.post('/laws/:id/veto', validateParamId, congressController.vetoLaw);
router.patch('/laws/:id/text', validateParamId, congressController.updateLawText);
router.delete('/laws/:id', validateParamId, congressController.deleteLaw);

// Special laws — mechanical, admin-triggered game events.
router.post('/piggish-deed', congressController.piggishDeed);
router.post('/earthquake', congressController.earthquake);

export default router;
