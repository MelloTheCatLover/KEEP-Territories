import { Request, Response, NextFunction } from 'express';
import * as congressService from '../services/congress.service';
import * as gameSettingsService from '../services/game-settings.service';
import * as audit from '../services/audit.service';
import { AppError } from '../types/errors';
import { LawStatus } from '../types/congress';
import { ActiveLaw, ACTIVE_LAWS } from '../types/game-settings';

const ACTIVE_LAW_RU: Record<ActiveLaw, string> = {
  none: 'ничего',
  teleport: 'Телепорт',
};

// Veto has its own endpoint (it resolves the acting team server-side), so it is
// not an accepted value for the plain status setter.
const VALID_STATUS: LawStatus[] = ['pending', 'accepted', 'rejected'];
const STATUS_RU: Record<LawStatus, string> = {
  pending: 'на голосовании',
  accepted: 'принят',
  rejected: 'отклонён',
  vetoed: 'наложено вето',
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

export async function vetoLaw(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { law, teamName } = await congressService.vetoLaw(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.law_veto',
      entityType: 'congress',
      entityId: law.id,
      seasonId: law.season_id,
      summary: `Вето команды «${teamName}» на закон «${law.text.slice(0, 60)}»`,
      metadata: { vetoed_by_team_id: law.vetoed_by_team_id },
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

export async function piggishDeed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await congressService.piggishDeed();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.piggish_deed',
      entityType: 'congress',
      summary: `Свинский поступок: диверсия каждой из ${result.teams} команд`,
      metadata: { teams: result.teams },
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function earthquake(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await congressService.earthquake();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.earthquake',
      entityType: 'congress',
      summary: `Землетрясение: ${result.assignments.length} секторов распределены между командами`,
      metadata: { count: result.assignments.length },
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// The single active mechanical law. GET is open to any authenticated user (the
// map shows teleport affordances when it is active); PUT is admin-only.
export async function getActiveLaw(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ active_law: await gameSettingsService.getActiveLaw() });
  } catch (error) {
    next(error);
  }
}

export async function setActiveLaw(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const law = req.body?.law;
    if (!ACTIVE_LAWS.includes(law)) {
      throw new AppError(400, `law должен быть одним из: ${ACTIVE_LAWS.join(', ')}`);
    }
    await gameSettingsService.setActiveLaw(law);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'congress.active_law',
      entityType: 'congress',
      summary: `Действующий закон: ${ACTIVE_LAW_RU[law as ActiveLaw]}`,
      metadata: { law },
    });
    res.status(200).json({ active_law: law });
  } catch (error) {
    next(error);
  }
}
