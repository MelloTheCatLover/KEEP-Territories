import { Router } from 'express';
import * as teamController from '../controllers/team.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireTeamRole } from '../middleware/role.middleware';
import { validateCreateTeam, validateParamId } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

router.post('/', validateCreateTeam, teamController.create);
router.get('/', teamController.getAll);
router.post('/leave', teamController.leave);
router.post('/transfer', requireTeamRole('captain'), teamController.transferCaptain);
router.get('/:id', validateParamId, teamController.getById);
router.post('/:id/join', validateParamId, teamController.join);

export default router;
