import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { TeamFullStats } from '../types/team-stats';
import { getFullStats } from './team-stats.service';

export type AwardResource = 'influence' | 'experience';

export const AWARD_RESOURCES: ReadonlyArray<AwardResource> = ['influence', 'experience'];

export interface TeamPoints {
  team_id: string;
  points: number;
}

export interface ProportionalAwardInput {
  /** Which resources to hand out. Each one needs its own total. */
  resources: AwardResource[];
  totals: Partial<Record<AwardResource, number>>;
  points: TeamPoints[];
}

export interface AwardShare {
  team_id: string;
  team_name: string;
  points: number;
  influence: number;
  experience: number;
}

export interface ProportionalAwardResult {
  shares: AwardShare[];
  teams: TeamFullStats[];
}

/**
 * Split `total` between `points` by the largest-remainder (Hare) method: each
 * gets floor(share), then the leftover units go to the biggest fractional
 * parts. The handed-out sum always equals `total` exactly.
 *
 * A negative total is split by magnitude and negated back, so taking away
 * works the same way as giving.
 */
export function splitProportionally(points: number[], total: number): number[] {
  const zeros = points.map(() => 0);
  const sum = points.reduce((acc, p) => acc + p, 0);
  if (sum <= 0 || total === 0) return zeros;

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const exact = points.map((p) => (magnitude * p) / sum);
  const base = exact.map((v) => Math.floor(v));
  let leftover = magnitude - base.reduce((acc, v) => acc + v, 0);

  // Biggest fraction first; ties go to the bigger score, then to input order.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || points[b.i] - points[a.i] || a.i - b.i);

  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    base[order[k].i] += 1;
    leftover -= 1;
  }

  return base.map((v) => v * sign);
}

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new AppError(400, `${label} должно быть целым числом`);
  }
  return value;
}

/**
 * Hand out influence and/or experience proportionally to per-team scores.
 * Applied as deltas on `team_adjustments`, so everything the team earned from
 * sectors stays intact and the level (hence upgrade points) follows the new
 * experience on its own.
 */
export async function applyProportionalAward(
  input: ProportionalAwardInput,
): Promise<ProportionalAwardResult> {
  const resources = Array.isArray(input.resources) ? input.resources : [];
  if (resources.length === 0) {
    throw new AppError(400, 'Выберите, что распределять: влияние и/или опыт');
  }
  for (const resource of resources) {
    if (!AWARD_RESOURCES.includes(resource)) {
      throw new AppError(400, `Неизвестный ресурс: ${resource}`);
    }
  }

  const totals: Record<AwardResource, number> = { influence: 0, experience: 0 };
  for (const resource of resources) {
    const label = resource === 'influence' ? 'Влияние' : 'Опыт';
    totals[resource] = assertInteger(input.totals?.[resource], label);
  }

  const rows = Array.isArray(input.points) ? input.points : [];
  if (rows.length === 0) {
    throw new AppError(400, 'Не переданы баллы команд');
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row?.team_id !== 'string' || row.team_id.length === 0) {
      throw new AppError(400, 'Некорректный team_id');
    }
    if (seen.has(row.team_id)) {
      throw new AppError(400, 'Команда указана дважды');
    }
    seen.add(row.team_id);
    const points = assertInteger(row.points, 'Баллы');
    if (points < 0) {
      throw new AppError(400, 'Баллы не могут быть отрицательными');
    }
  }

  const pointsSum = rows.reduce((acc, r) => acc + r.points, 0);
  if (pointsSum <= 0) {
    throw new AppError(400, 'Сумма баллов должна быть больше нуля');
  }

  const teamIds = rows.map((r) => r.team_id);
  const teamRes = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM teams WHERE id = ANY($1::uuid[])',
    [teamIds],
  );
  if (teamRes.rows.length !== teamIds.length) {
    throw new AppError(404, 'Некоторые команды не найдены');
  }
  const nameById = new Map(teamRes.rows.map((t) => [t.id, t.name]));

  const scores = rows.map((r) => r.points);
  const influence = resources.includes('influence')
    ? splitProportionally(scores, totals.influence)
    : scores.map(() => 0);
  const experience = resources.includes('experience')
    ? splitProportionally(scores, totals.experience)
    : scores.map(() => 0);

  const shares: AwardShare[] = rows.map((r, i) => ({
    team_id: r.team_id,
    team_name: nameById.get(r.team_id)!,
    points: r.points,
    influence: influence[i],
    experience: experience[i],
  }));

  const changed = shares.filter((s) => s.influence !== 0 || s.experience !== 0);

  if (changed.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const share of changed) {
        await client.query(
          `INSERT INTO team_adjustments
             (team_id, influence_delta, experience_delta, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (team_id) DO UPDATE SET
             influence_delta = team_adjustments.influence_delta + EXCLUDED.influence_delta,
             experience_delta = team_adjustments.experience_delta + EXCLUDED.experience_delta,
             updated_at = NOW()`,
          [share.team_id, share.influence, share.experience],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const teams = await Promise.all(shares.map((s) => getFullStats(s.team_id)));

  return { shares, teams };
}
