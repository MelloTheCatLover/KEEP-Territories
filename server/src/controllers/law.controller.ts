import { Request, Response, NextFunction } from 'express';
import * as lawService from '../services/law.service';
import * as audit from '../services/audit.service';

export async function getCatalog(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({ prizes: lawService.WHEEL_PRIZES });
  } catch (error) {
    next(error);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await lawService.list());
  } catch (error) {
    next(error);
  }
}

/** Лента колеса для участников — что кому выпало. */
export async function feed(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ spins: await lawService.listFeed() });
  } catch (error) {
    next(error);
  }
}

export async function spin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const view = await lawService.spinWheel(req.body?.team_id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'law.wheel_spin',
      entityType: 'law_effect',
      entityId: view.id,
      summary: `Колесо фортуны команде ${view.team_name}: «${view.title}»${
        view.note ? ` — ${view.note}` : ''
      }`,
      metadata: { law: view.law, kind: view.kind, status: view.status, note: view.note },
    });
    res.status(201).json(view);
  } catch (error) {
    next(error);
  }
}

export async function apply(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const view = await lawService.applyArmed(req.params.id, req.body?.sector_id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'law.effect_apply',
      entityType: 'law_effect',
      entityId: view.id,
      summary: `«${view.title}» команды ${view.team_name}: ${view.note ?? 'применено'}`,
      metadata: { law: view.law, kind: view.kind, sector_id: view.sector_id },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}

/** Закон «Граффити»: покрасить сектор в цвет команды. */
export async function paint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const view = await lawService.paintGraffiti(req.body?.team_id, req.body?.sector_id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'law.graffiti_paint',
      entityType: 'law_effect',
      entityId: view.id,
      summary: `Граффити команды ${view.team_name} на секторе ${
        view.sector_number ?? '—'
      }`,
      metadata: { law: view.law, sector_id: view.sector_id, note: view.note },
    });
    res.status(201).json(view);
  } catch (error) {
    next(error);
  }
}

/** Закон «Рука помощи»: раздать по одному доп. рероллу тем, у кого его нет. */
export async function helpingHand(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await lawService.grantHelpingHand();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'law.helping_hand',
      entityType: 'law_effect',
      summary:
        `Рука помощи: доп. реролл получили ${result.granted.length} команд` +
        (result.skipped.length > 0
          ? `, пропущено ${result.skipped.length} (реролл уже был)`
          : ''),
      metadata: { granted: result.granted, skipped: result.skipped },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/** Смыть краску. */
export async function wash(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const view = await lawService.washGraffiti(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'law.graffiti_wash',
      entityType: 'law_effect',
      entityId: view.id,
      summary: `Смыто граффити команды ${view.team_name}`,
      metadata: { law: view.law, sector_id: view.sector_id },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}

export async function cancel(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const view = await lawService.cancel(req.params.id);
    await audit.record({
      actorUserId: req.user!.userId,
      teamId: view.team_id,
      action: 'law.effect_cancel',
      entityType: 'law_effect',
      entityId: view.id,
      summary: `Снята плюшка «${view.title}» у команды ${view.team_name}`,
      metadata: { law: view.law, kind: view.kind },
    });
    res.status(200).json(view);
  } catch (error) {
    next(error);
  }
}
