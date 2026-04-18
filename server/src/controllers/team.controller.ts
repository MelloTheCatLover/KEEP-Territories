import { Request, Response, NextFunction } from 'express';
import * as teamService from '../services/team.service';
import { AppError } from '../types/errors';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamService.create(
      { name: req.body.name.trim(), home_sector_id: req.body.home_sector_id },
      req.user!.userId
    );

    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
}

export async function update(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { color } = req.body;
    const team = await teamService.updateTeam(req.params.id, req.user!.userId, { color });
    res.status(200).json(team);
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
