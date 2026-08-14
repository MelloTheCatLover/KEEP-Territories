import { Router } from 'express';
import * as purchaseController from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
// Лавки скрыты от команд, как и остальные персонажи: покупку проводит
// председатель КТП у сектора персонажа.
router.use(requireAdmin);

router.get('/catalog', purchaseController.getCatalog);
router.get('/', purchaseController.list);
router.post('/', purchaseController.buy);
router.post('/:id/cancel', validateParamId, purchaseController.cancel);

export default router;
