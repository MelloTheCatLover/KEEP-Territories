import { Request, Response, NextFunction } from 'express';
import * as submissionService from '../services/submission.service';

export async function startAction(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await submissionService.startAction(
      req.params.sectorId,
      req.user!.userId,
      req.body?.action_type,
    );
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
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
}
