import { Router } from 'express';
import * as trophyController from '../controllers/trophy.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
// Кубки всегда видны админу; участникам — только при включённом флаге
// trophies_visible (переключается на карте). Проверка внутри контроллера.
router.get('/', trophyController.list);

export default router;
