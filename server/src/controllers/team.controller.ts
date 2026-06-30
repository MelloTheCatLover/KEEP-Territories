import { Request, Response, NextFunction } from 'express';
import * as teamService from '../services/team.service';
import * as audit from '../services/audit.service';
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

    await audit.record({
      actorUserId: req.user!.userId,
      teamId: team.id,
      action: 'team.create',
      entityType: 'team',
      entityId: team.id,
      summary: `Создана команда «${team.name}»`,
      metadata: { name: team.name, color: team.color },
    });
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
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: team.id,
      action: 'team.join',
      entityType: 'team',
      entityId: team.id,
      summary: `Игрок вступил в команду «${team.name}»`,
    });
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await teamService.leave(req.user!.userId);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'team.leave',
      entityType: 'team',
      summary: 'Игрок вышел из команды',
    });
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
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: team.id,
      action: 'team.transfer',
      entityType: 'team',
      entityId: team.id,
      summary: `Капитанство в команде «${team.name}» передано другому игроку`,
      metadata: { new_captain_id: newCaptainId },
    });
    res.status(200).json(team);
  } catch (error) {
    next(error);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.query.season_id;
    let seasonId: string | undefined;
    if (typeof raw === 'string' && raw.length > 0) {
      if (!UUID_REGEX.test(raw)) throw new AppError(400, 'Invalid season_id');
      seasonId = raw;
    }
    const teams = await teamService.getAll(seasonId);
    res.status(200).json(teams);
  } catch (error) {
    next(error);
  }
}

export async function setIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patch: { name?: string; color?: string | null } = {};
    if (req.body?.name !== undefined) patch.name = req.body.name;
    if (req.body?.color !== undefined) patch.color = req.body.color;
    const team = await teamService.setIdentity(req.user!.userId, patch);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: team.id,
      action: 'team.update',
      entityType: 'team',
      entityId: team.id,
      summary: `Команда «${team.name}» изменила ${'color' in patch ? 'цвет' : ''}${'color' in patch && 'name' in patch ? ' и ' : ''}${'name' in patch ? 'название' : ''}`.trim(),
      metadata: { patch, by: 'captain' },
    });
    res.status(200).json(team);
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
    const changed = [
      'name' in patch ? `название → «${patch.name}»` : null,
      'color' in patch ? `цвет → ${patch.color ?? 'без цвета'}` : null,
    ].filter(Boolean).join(', ');
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: team.id,
      action: 'team.update',
      entityType: 'team',
      entityId: team.id,
      summary: `Админ изменил команду «${team.name}»${changed ? `: ${changed}` : ''}`,
      metadata: { patch, by: 'admin' },
    });
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
    const doomed = await teamService.getById(req.params.id).catch(() => null);
    await teamService.adminDelete(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'team.delete',
      entityType: 'team',
      entityId: req.params.id,
      summary: `Админ удалил команду${doomed ? ` «${doomed.name}»` : ''}`,
      metadata: { name: doomed?.name ?? null },
    });
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
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: result === null ? null : req.params.id,
      action: 'team.kick',
      entityType: 'team',
      entityId: req.params.id,
      summary: result === null
        ? 'Админ исключил участника — команда расформирована (не осталось игроков)'
        : `Админ исключил участника из команды «${result.name}»`,
      metadata: { kicked_user_id: req.params.userId, team_deleted: result === null },
    });
    if (result === null) {
      res.status(200).json({ team_deleted: true });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
