import { Request, Response, NextFunction } from 'express';
import * as congressService from '../services/congress.service';
import * as audit from '../services/audit.service';
import { AppError } from '../types/errors';
import { LawStatus } from '../types/congress';

const VALID_STATUS: LawStatus[] = ['pending', 'accepted', 'rejected'];
const STATUS_RU: Record<LawStatus, string> = {
  pending: 'на голосовании',
  accepted: 'принят',
  rejected: 'отклонён',
};

export async function getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teams = await congressService.getTeamInfluence();
    res.status(200).json({ teams });
  } catch (error) {
    next(error);
  }
}

export async function listLaws(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ laws: await congressService.listLaws() });
  } catch (error) {
    next(error);
  }
}

export async function listPublicLaws(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ laws: await congressService.listPublicLaws() });
  } catch (error) {
    next(error);
  }
}

export async function createLaw(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const law = await congressService.createLaw(req.body?.text);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.law_create',
      entityType: 'congress',
      entityId: law.id,
      seasonId: law.season_id,
      summary: `Добавлен закон на съезд: «${law.text.slice(0, 80)}»`,
    });
    res.status(201).json(law);
  } catch (error) {
    next(error);
  }
}

export async function updateLawText(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const law = await congressService.updateLawText(req.params.id, req.body?.text);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.law_edit',
      entityType: 'congress',
      entityId: law.id,
      seasonId: law.season_id,
      summary: `Изменён текст закона: «${law.text.slice(0, 80)}»`,
    });
    res.status(200).json(law);
  } catch (error) {
    next(error);
  }
}

export async function setLawStatus(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = req.body?.status as LawStatus;
    if (!VALID_STATUS.includes(status)) {
      throw new AppError(400, `status должен быть одним из: ${VALID_STATUS.join(', ')}`);
    }
    const law = await congressService.setLawStatus(req.params.id, status);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.law_decide',
      entityType: 'congress',
      entityId: law.id,
      seasonId: law.season_id,
      summary: `Закон «${law.text.slice(0, 60)}» — ${STATUS_RU[law.status]}`,
      metadata: { status: law.status },
    });
    res.status(200).json(law);
  } catch (error) {
    next(error);
  }
}

export async function deleteLaw(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await congressService.deleteLaw(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.law_delete',
      entityType: 'congress',
      entityId: req.params.id,
      summary: 'Удалён закон со съезда',
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
