import { Request, Response, NextFunction } from 'express';
import * as seasonService from '../services/season.service';

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
    res.status(201).json(season);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, starts_at, ends_at } = req.body ?? {};
    res.json(await seasonService.update(req.params.id, { name, starts_at, ends_at }));
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
    res.json(await seasonService.activate(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await seasonService.remove(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
