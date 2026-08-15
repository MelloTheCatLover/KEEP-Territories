import { Router } from 'express';
import * as lawController from '../controllers/law.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// Лента колеса — новости смены: её видят и участники.
router.get('/feed', lawController.feed);

// Закон включает председатель: колесо даёт он, крутит сервер.
router.use(requireAdmin);

router.get('/wheel/catalog', lawController.getCatalog);
router.get('/', lawController.list);
router.post('/wheel/spin', lawController.spin);
router.post('/:id/apply', validateParamId, lawController.apply);
router.post('/:id/cancel', validateParamId, lawController.cancel);

export default router;
