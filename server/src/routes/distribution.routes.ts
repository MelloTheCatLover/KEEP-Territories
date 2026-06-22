import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as distributionController from '../controllers/distribution.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { AppError } from '../types/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

router.get('/', distributionController.getState);
router.post('/prepare', distributionController.prepare);
router.post('/spin', distributionController.spin);
router.post('/reset', distributionController.reset);
router.patch('/participants/:childId', validateChildIdParam, distributionController.setCategory);

export default router;
