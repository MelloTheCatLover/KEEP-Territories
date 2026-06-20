import { Request, Response, NextFunction } from 'express';
import * as childrenListService from '../services/children-list.service';

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await childrenListService.listAll());
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body ?? {};
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'Название списка обязательно' });
      return;
    }
    res.status(201).json(await childrenListService.create(name));
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await childrenListService.remove(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getEntries(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await childrenListService.getEntries(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function addEntry(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { full_name, code } = req.body ?? {};
    if (typeof full_name !== 'string') {
      res.status(400).json({ error: 'Имя ребёнка обязательно' });
      return;
    }
    const entry = await childrenListService.addEntry(
      req.params.id,
      full_name,
      typeof code === 'string' ? code : undefined,
    );
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
}

export async function removeEntry(
  req: Request<{ id: string; entryId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await childrenListService.removeEntry(req.params.entryId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function issueAccount(
  req: Request<{ id: string; entryId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await childrenListService.issueAccount(req.params.entryId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
