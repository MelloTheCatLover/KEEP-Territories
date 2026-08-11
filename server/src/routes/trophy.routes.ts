import { Router } from 'express';
import * as trophyController from '../controllers/trophy.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

router.use(authenticate);
// Кубки всегда видны админу; участникам — только при включённом флаге
// trophies_visible (переключается на карте). Проверка внутри контроллера.
router.get('/', trophyController.list);

// Ручные победители и полная раскладка метрик — только админу: журнал
// показывает чужие приватные показатели (стрик, перехваты).
router.get('/overrides', requireAdmin, trophyController.listOverrides);
router.put('/overrides/:key', requireAdmin, trophyController.setOverride);
router.get('/:key/details', requireAdmin, trophyController.details);

export default router;
