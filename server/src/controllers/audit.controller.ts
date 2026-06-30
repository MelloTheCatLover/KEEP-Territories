import { Request, Response, NextFunction } from 'express';
import * as auditService from '../services/audit.service';
import { AppError } from '../types/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(raw: unknown, label: string): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (!UUID_REGEX.test(raw)) throw new AppError(400, `Invalid ${label}`);
  return raw;
}

function strParam(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

    const result = await auditService.list({
      teamId: uuidParam(req.query.team_id, 'team_id'),
      actorUserId: uuidParam(req.query.actor_id, 'actor_id'),
      entityType: strParam(req.query.entity_type),
      action: strParam(req.query.action),
      from: strParam(req.query.from),
      to: strParam(req.query.to),
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
