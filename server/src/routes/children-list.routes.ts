import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as childrenListController from '../controllers/children-list.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';
import { AppError } from '../types/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateChildParams(
  req: Request<{ id: string; childId: string }>,
  _res: Response,
  next: NextFunction,
): void {
  if (!UUID_REGEX.test(req.params.id) || !UUID_REGEX.test(req.params.childId)) {
    return next(new AppError(400, 'Invalid ID format'));
  }
  next();
}

function validateChildIdParam(
  req: Request<{ childId: string }>,
  _res: Response,
  next: NextFunction,
): void {
  if (!UUID_REGEX.test(req.params.childId)) {
    return next(new AppError(400, 'Invalid ID format'));
  }
  next();
}

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', childrenListController.list);
router.post('/', childrenListController.create);
router.get('/dashboard', childrenListController.dashboard);
router.delete('/children/:childId', validateChildIdParam, childrenListController.deleteChild);
router.delete('/:id', validateParamId, childrenListController.remove);
router.get('/:id/members', validateParamId, childrenListController.getMembers);
router.post('/:id/members', validateParamId, childrenListController.addChild);
router.post('/:id/members/bulk', validateParamId, childrenListController.bulkAdd);
router.delete('/:id/members/:childId', validateChildParams, childrenListController.removeMember);
router.post('/:id/members/:childId/account', validateChildParams, childrenListController.issueAccount);

export default router;
