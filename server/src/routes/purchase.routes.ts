import { Router } from 'express';
import * as purchaseController from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Единственная ручка лавок, открытая командам: свои заряженные импланты. Карта
// показывает по ним действия, которые имплант разрешает (раздвоение).
router.get('/mine', purchaseController.listMine);

// Остальное скрыто от команд, как и прочие персонажи: покупку проводит
// председатель КТП у сектора персонажа.
router.use(requireAdmin);

router.get('/catalog', purchaseController.getCatalog);
router.get('/', purchaseController.list);
router.post('/', purchaseController.buy);
router.post('/:id/cancel', validateParamId, purchaseController.cancel);

export default router;
