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

export async function getMembers(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await childrenListService.getMembers(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function addChild(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { full_name } = req.body ?? {};
    if (typeof full_name !== 'string') {
      res.status(400).json({ error: 'ФИО обязательно' });
      return;
    }
    res.status(201).json(await childrenListService.addChild(req.params.id, full_name));
  } catch (error) {
    next(error);
  }
}

export async function bulkAdd(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body ?? {};
    let names: string[];
    if (Array.isArray(body.names)) {
      names = body.names.filter((n: unknown): n is string => typeof n === 'string');
    } else if (typeof body.text === 'string') {
      names = body.text.split('\n');
    } else {
      res.status(400).json({ error: 'Передайте text (строки) или names (массив)' });
      return;
    }
    res.status(201).json(await childrenListService.bulkAdd(req.params.id, names));
  } catch (error) {
    next(error);
  }
}

export async function removeMember(
  req: Request<{ id: string; childId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await childrenListService.removeMember(req.params.id, req.params.childId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function issueAccount(
  req: Request<{ id: string; childId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(201).json(await childrenListService.issueAccount(req.params.childId));
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: Request<{ childId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { password } = req.body ?? {};
    res.json(
      await childrenListService.resetPassword(
        req.params.childId,
        typeof password === 'string' ? password : undefined,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteChild(
  req: Request<{ childId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await childrenListService.deleteChild(req.params.childId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function dashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await childrenListService.dashboard());
  } catch (error) {
    next(error);
  }
}
