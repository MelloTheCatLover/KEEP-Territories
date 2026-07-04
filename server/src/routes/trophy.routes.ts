import { Router } from 'express';
import * as trophyController from '../controllers/trophy.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

router.use(authenticate);
// Кубки скрыты от участников целиком — только админ видит рейтинги.
router.get('/', requireAdmin, trophyController.list);

export default router;
