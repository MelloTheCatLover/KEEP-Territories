import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { Sector, SectorPublic } from '../types/sector';
import { getById } from './sector.service';
import * as purchaseService from './purchase.service';

/**
 * Fixed reward bundle per final place in a special-sector event. Sized for a
 * full field of 8 teams — the form caps at 8 standings.
 */
export const SPECIAL_PLACE_REWARDS: Record<number, { influence: number; experience: number }> = {
  1: { influence: 14, experience: 450 },
  2: { influence: 12, experience: 400 },
  3: { influence: 10, experience: 350 },
  4: { influence: 8, experience: 300 },
  5: { influence: 7, experience: 250 },
  6: { influence: 6, experience: 200 },
  7: { influence: 5, experience: 150 },
  8: { influence: 4, experience: 100 },
};

export const MAX_SPECIAL_PLACE = 8;

export interface PlaceAssignment {
  team_id: string;
  place: number;
}

export interface SpecialCaptureResult {
  sector: SectorPublic;
  awards: Array<{ team_id: string; place: number; influence: number; experience: number }>;
}

/** Validate + normalise the standings coming from the request body. */
export function parseAssignments(raw: unknown): PlaceAssignment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, 'Нужно указать хотя бы одну команду и её место');
  }
  // A place may be shared by several teams (ties) — each tied team earns that
  // place's full bundle. A team, however, still gets exactly one place.
  const seenTeams = new Set<string>();
  const assignments: PlaceAssignment[] = [];
  for (const item of raw) {
    const teamId = (item as { team_id?: unknown })?.team_id;
    const place = (item as { place?: unknown })?.place;
    if (typeof teamId !== 'string' || teamId.length === 0) {
      throw new AppError(400, 'team_id обязателен для каждой строки');
    }
    if (typeof place !== 'number' || !Number.isInteger(place) || place < 1 || place > MAX_SPECIAL_PLACE) {
      throw new AppError(400, `place должен быть целым от 1 до ${MAX_SPECIAL_PLACE}`);
    }
    if (seenTeams.has(teamId)) {
      throw new AppError(400, 'Одна команда не может занять два места');
    }
    seenTeams.add(teamId);
    assignments.push({ team_id: teamId, place });
  }
  return assignments;
}

/**
 * Record a special-sector event: overwrite any prior standings for this sector,
 * award each placed team its fixed influence/experience bundle, and hand the
 * sector (colour + capture-cup credit) to the 1st-place team. Re-runnable —
 * re-submitting replaces the previous standings for the same sector.
 */
export async function captureSpecialSector(
  sectorId: string,
  requested: PlaceAssignment[],
): Promise<SpecialCaptureResult> {
  // «Высокий старт» может поднять место команды — итоговая раскладка ниже.
  let assignments = requested;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sectorRes = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId],
    );
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Сектор не найден');
    }
    if (!sectorRes.rows[0].is_special) {
      throw new AppError(400, 'Секторный захват по местам доступен только для особых секторов');
    }

    const teamIds = assignments.map((a) => a.team_id);
    const teamsRes = await client.query<{ id: string }>(
      `SELECT id FROM teams WHERE id = ANY($1::uuid[])`,
      [teamIds],
    );
    if (teamsRes.rows.length !== teamIds.length) {
      throw new AppError(400, 'Одна из команд не найдена');
    }

    // Replace prior standings for this sector (editable / idempotent).
    await client.query('DELETE FROM special_sector_awards WHERE sector_id = $1', [sectorId]);

    // Товар мастера «высокий старт»: команда начинает событие с преимуществом —
    // итоговое место поднимается на ступень. Имплант тратится здесь, поэтому
    // повторная правка результатов того же сектора преимущество уже не даст.
    const effective: PlaceAssignment[] = [];
    for (const a of assignments) {
      const highStartId = await purchaseService.takeArmed(client, a.team_id, 'high_start');
      if (highStartId && a.place > 1) {
        await purchaseService.consume(client, highStartId, {
          sectorId,
          note: `Высокий старт: место ${a.place} → ${a.place - 1}`,
        });
        effective.push({ team_id: a.team_id, place: a.place - 1 });
      } else {
        if (highStartId) {
          await purchaseService.consume(client, highStartId, {
            sectorId,
            note: 'Высокий старт: команда и так первая',
          });
        }
        effective.push(a);
      }
    }
    assignments = effective;

    const awards: SpecialCaptureResult['awards'] = [];
    for (const { team_id, place } of assignments) {
      const reward = SPECIAL_PLACE_REWARDS[place];
      await client.query(
        `INSERT INTO special_sector_awards (sector_id, team_id, place, influence, experience)
         VALUES ($1, $2, $3, $4, $5)`,
        [sectorId, team_id, place, reward.influence, reward.experience],
      );
      awards.push({ team_id, place, influence: reward.influence, experience: reward.experience });
    }

    // The best (lowest) place present owns the sector: paints it and earns the
    // capture-cup credit. Usually that is 1st, but standings need not include a
    // 1st place — whoever ranks highest still takes the colour. A sector has a
    // single owner, so a tie at the top goes to the first-listed team of that
    // place (every tied team still gets the reward bundle).
    const bestPlace = Math.min(...assignments.map((a) => a.place));
    const winner = assignments.find((a) => a.place === bestPlace) ?? null;
    await client.query(
      `UPDATE sectors SET
         status = $1,
         captured_by_team_id = $2,
         capturing_by_team_id = NULL,
         capture_started_at = NULL,
         current_action_type = NULL
       WHERE id = $3`,
      [winner ? 'captured' : 'free', winner ? winner.team_id : null, sectorId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const sector = await getById(sectorId);
  return {
    sector,
    awards: assignments.map(({ team_id, place }) => ({
      team_id,
      place,
      influence: SPECIAL_PLACE_REWARDS[place].influence,
      experience: SPECIAL_PLACE_REWARDS[place].experience,
    })),
  };
}
