import { Request, Response, NextFunction } from 'express';
import * as teamService from '../services/team.service';
import { AppError } from '../types/errors';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamService.create(
      {
        name: req.body.name.trim(),
        home_sector_id: req.body.home_sector_id,
        color: req.body.color ?? null,
      },
      req.user!.userId
    );

    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamService.getById(req.params.id);
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

export async function join(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamService.join(req.params.id, req.user!.userId);
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await teamService.leave(req.user!.userId);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function transferCaptain(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newCaptainId } = req.body;

    if (!newCaptainId || typeof newCaptainId !== 'string') {
      throw new AppError(400, 'newCaptainId is required');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newCaptainId)) {
      throw new AppError(400, 'Invalid newCaptainId format');
    }
    if (newCaptainId === req.user!.userId) {
      throw new AppError(400, 'Cannot transfer captain role to yourself');
    }

    const teamId = await teamService.transferCaptain(req.user!.userId, newCaptainId);
    const team = await teamService.getById(teamId);
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

export async function getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teams = await teamService.getAll();
    res.status(200).json(teams);
  } catch (error) {
    next(error);
  }
}

export async function adminUpdate(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const patch: { name?: string; color?: string | null } = {};
    if (req.body?.name !== undefined) patch.name = req.body.name;
    if (req.body?.color !== undefined) patch.color = req.body.color;
    const team = await teamService.adminUpdate(req.params.id, patch);
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

export async function adminDelete(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await teamService.adminDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function adminKick(
  req: Request<{ id: string; userId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await teamService.adminKickMember(req.params.id, req.params.userId);
    if (result === null) {
      res.status(200).json({ team_deleted: true });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
