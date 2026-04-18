import { Request, Response, NextFunction } from 'express';
import * as submissionService from '../services/submission.service';

export async function startAction(
  req: Request<{ sectorId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submission = await submissionService.startAction(
      req.params.sectorId,
      req.user!.userId,
      req.body?.action_type,
    );
    res.status(201).json(submission);
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

export async function approve(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawComment = req.body?.comment;
    const comment =
      typeof rawComment === 'string' && rawComment.trim().length > 0
        ? rawComment.trim()
        : null;
    const submission = await submissionService.approve(
      req.params.id,
      req.user!.userId,
      comment,
    );
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
}
