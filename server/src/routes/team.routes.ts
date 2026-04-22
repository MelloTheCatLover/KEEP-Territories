import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as teamController from '../controllers/team.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { requireTeamRole } from '../middleware/role.middleware';
import { validateCreateTeam, validateParamId } from '../middleware/validate.middleware';
import { AppError } from '../types/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateKickParams(
  req: Request<{ id: string; userId: string }>,
  _res: Response,
  next: NextFunction,
): void {
  if (!UUID_REGEX.test(req.params.id) || !UUID_REGEX.test(req.params.userId)) {
    return next(new AppError(400, 'Invalid ID format'));
  }
  next();
}

const router = Router();

router.use(authenticate);

router.post('/', validateCreateTeam, teamController.create);
router.get('/', teamController.getAll);
router.post('/leave', teamController.leave);
router.post('/transfer', requireTeamRole('captain'), teamController.transferCaptain);
router.get('/:id', validateParamId, teamController.getById);
router.post('/:id/join', validateParamId, teamController.join);

router.patch('/:id', requireAdmin, validateParamId, teamController.adminUpdate);
router.delete('/:id', requireAdmin, validateParamId, teamController.adminDelete);
router.delete('/:id/members/:userId', requireAdmin, validateKickParams, teamController.adminKick);

export default router;
