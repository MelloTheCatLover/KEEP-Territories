import { Request, Response, NextFunction } from 'express';
import * as submissionService from '../services/submission.service';
import * as audit from '../services/audit.service';
import { SectorActionType } from '../types/sector';

const ACTION_RU: Record<SectorActionType, string> = {
  capture: 'захват',
  recapture: 'перезахват',
  fortify: 'укрепление',
  remove_fortification: 'снятие укрепления',
};

function sectorLabel(number: number | null, q: number, r: number): string {
  return number !== null ? `сектор #${number}` : `сектор (${q};${r})`;
}

export async function startAction(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const teamId = typeof req.body?.team_id === 'string' ? req.body.team_id : undefined;
    const result = await submissionService.startAction(
      req.params.sectorId,
      req.user!.userId,
      req.body?.action_type,
      teamId,
    );
    const s = result.submission;
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: s.team.id,
      action: `submission.${s.action_type}`,
      entityType: 'submission',
      entityId: s.id,
      summary: `Команда «${s.team.name}» подала заявку на ${ACTION_RU[s.action_type]} — ${sectorLabel(s.sector.number, s.sector.q, s.sector.r)}`,
      metadata: { action_type: s.action_type, sector_number: s.sector.number, difficulty: s.difficulty.slug },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getCurrentForSector(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submission = await submissionService.getCurrentForSector(
      req.params.sectorId,
      req.user!.userId,
    );
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
}

export async function listPending(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await submissionService.getPending();
    res.status(200).json(items);
  } catch (error) {
    next(error);
  }
}

function parseComment(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export async function approve(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submission = await submissionService.approve(
      req.params.id,
      req.user!.userId,
      parseComment(req.body?.comment),
    );
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: submission.team.id,
      action: `sector.${submission.action_type}`,
      entityType: 'sector',
      entityId: submission.sector.id,
      summary: `Одобрено: ${ACTION_RU[submission.action_type]} команды «${submission.team.name}» — ${sectorLabel(submission.sector.number, submission.sector.q, submission.sector.r)}`,
      metadata: { action_type: submission.action_type, submission_id: submission.id, sector_number: submission.sector.number, difficulty: submission.difficulty.slug },
    });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
}

export async function reject(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submission = await submissionService.reject(
      req.params.id,
      req.user!.userId,
      parseComment(req.body?.comment),
    );
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: submission.team.id,
      action: 'submission.reject',
      entityType: 'submission',
      entityId: submission.id,
      summary: `Отклонена заявка команды «${submission.team.name}» на ${ACTION_RU[submission.action_type]} — ${sectorLabel(submission.sector.number, submission.sector.q, submission.sector.r)}`,
      metadata: { action_type: submission.action_type, sector_number: submission.sector.number, comment: submission.comment },
    });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
}

export async function dropPending(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await submissionService.dropPending(
      req.params.id,
      req.user!.userId,
    );
    const s = result.submission;
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: s.team.id,
      action: 'submission.drop',
      entityType: 'submission',
      entityId: s.id,
      summary: `Команда «${s.team.name}» сняла свою заявку (${ACTION_RU[s.action_type]}) — штраф −${result.penalty.influence} влияния, −${result.penalty.experience} опыта`,
      metadata: { action_type: s.action_type, penalty: result.penalty, sector_number: s.sector.number },
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
