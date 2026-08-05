import { Request, Response, NextFunction } from 'express';
import * as awardService from '../services/proportional-award.service';
import * as audit from '../services/audit.service';

export async function applyProportional(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await awardService.applyProportionalAward({
      resources: req.body?.resources,
      totals: req.body?.totals ?? {},
      points: req.body?.points,
    });

    const handed = result.shares.reduce(
      (acc, s) => ({
        influence: acc.influence + s.influence,
        experience: acc.experience + s.experience,
      }),
      { influence: 0, experience: 0 },
    );
    const parts: string[] = [];
    if (handed.influence !== 0) parts.push(`влияния ${handed.influence}`);
    if (handed.experience !== 0) parts.push(`опыта ${handed.experience}`);

    await audit.record({
      actorUserId: req.user!.userId,
      action: 'team.proportional_award',
      entityType: 'team',
      summary: `Админ раздал по баллам ${parts.join(' и ') || '0'} на ${result.shares.length} команд`,
      metadata: {
        resources: req.body?.resources,
        totals: req.body?.totals,
        shares: result.shares,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
