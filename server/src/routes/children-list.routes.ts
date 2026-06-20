import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as childrenListController from '../controllers/children-list.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { validateParamId } from '../middleware/validate.middleware';
import { AppError } from '../types/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEntryParams(
  req: Request<{ id: string; entryId: string }>,
  _res: Response,
  next: NextFunction,
): void {
  if (!UUID_REGEX.test(req.params.id) || !UUID_REGEX.test(req.params.entryId)) {
    return next(new AppError(400, 'Invalid ID format'));
  }
  next();
}

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', childrenListController.list);
router.post('/', childrenListController.create);
router.delete('/:id', validateParamId, childrenListController.remove);
router.get('/:id/entries', validateParamId, childrenListController.getEntries);
router.post('/:id/entries', validateParamId, childrenListController.addEntry);
router.delete('/:id/entries/:entryId', validateEntryParams, childrenListController.removeEntry);
router.post('/:id/entries/:entryId/account', validateEntryParams, childrenListController.issueAccount);

export default router;
