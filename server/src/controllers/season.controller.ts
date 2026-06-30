import { Request, Response, NextFunction } from 'express';
import * as seasonService from '../services/season.service';
import * as audit from '../services/audit.service';

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await seasonService.listAll());
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await seasonService.getById(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, starts_at, ends_at } = req.body ?? {};
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'Название сезона обязательно' });
      return;
    }
    const season = await seasonService.create({
      name,
      starts_at: typeof starts_at === 'string' ? starts_at : null,
      ends_at: typeof ends_at === 'string' ? ends_at : null,
    });
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'season.create',
      entityType: 'season',
      entityId: season.id,
      seasonId: season.id,
      summary: `Создан сезон «${season.name}»`,
    });
    res.status(201).json(season);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, starts_at, ends_at } = req.body ?? {};
    const season = await seasonService.update(req.params.id, { name, starts_at, ends_at });
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'season.update',
      entityType: 'season',
      entityId: season.id,
      seasonId: season.id,
      summary: `Изменён сезон «${season.name}»`,
      metadata: { patch: { name, starts_at, ends_at } },
    });
    res.json(season);
  } catch (error) {
    next(error);
  }
}

export async function setLists(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { list_ids } = req.body ?? {};
    if (!Array.isArray(list_ids) || !list_ids.every((x) => typeof x === 'string')) {
      res.status(400).json({ error: 'list_ids должен быть массивом id' });
      return;
    }
    res.json(await seasonService.setLists(req.params.id, list_ids));
  } catch (error) {
    next(error);
  }
}

export async function activate(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const season = await seasonService.activate(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'season.activate',
      entityType: 'season',
      entityId: season.id,
      seasonId: season.id,
      summary: `Активирован сезон «${season.name}»`,
    });
    res.json(season);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const doomed = await seasonService.getById(req.params.id).catch(() => null);
    await seasonService.remove(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'season.delete',
      entityType: 'season',
      entityId: req.params.id,
      summary: `Удалён сезон${doomed ? ` «${doomed.name}»` : ''}`,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
