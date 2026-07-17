import { Request, Response, NextFunction } from 'express';
import * as mapGeneratorService from '../services/map-generator.service';
import * as audit from '../services/audit.service';

export async function generateMap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const raw = req.body?.preset ?? mapGeneratorService.DEFAULT_PRESET;
    if (!mapGeneratorService.isMapPresetId(raw)) {
      res.status(400).json({ error: `Неизвестный пресет карты: ${String(raw)}` });
      return;
    }
    const result = await mapGeneratorService.generateMap(raw);
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'map.generate',
      entityType: 'map',
      summary: `Админ сгенерировал карту «${mapGeneratorService.MAP_PRESETS[raw].title}» (${result.length} секторов)`,
      metadata: { count: result.length, preset: raw },
    });
    res.status(201).json({ sectors: result, count: result.length });
  } catch (err) {
    next(err);
  }
}

/** Both fixed presets with their cells — the admin picks one and previews it. */
export async function listPresets(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const presets = mapGeneratorService.MAP_PRESET_IDS.map((id) => {
      const { build, ...info } = mapGeneratorService.MAP_PRESETS[id];
      return { ...info, cells: build() };
    });
    res.status(200).json({ presets, default: mapGeneratorService.DEFAULT_PRESET });
  } catch (err) {
    next(err);
  }
}

export async function deleteAll(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await mapGeneratorService.deleteAllSectors();
    await audit.record({
      actorUserId: req.user!.userId,
      action: 'map.clear',
      entityType: 'map',
      summary: `Админ удалил карту (${result.deleted_count} секторов, ${result.deleted_teams_count} команд)`,
      metadata: result,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams_count = await mapGeneratorService.countTeams();
    res.status(200).json({ teams_count });
  } catch (err) {
    next(err);
  }
}
