import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { StatName } from '../types/team-stats';
import {
  EncounterEffect,
  EncounterInstanceView,
  TeamSnapshot,
} from '../types/encounter';
import { evaluate } from './encounter-engine';
import * as teamStatsService from './team-stats.service';
import * as gameSettingsService from './game-settings.service';
import { getActiveSeasonId } from './season.service';

type Db = Pick<PoolClient, 'query'>;

export interface EncounterPoolRow {
  number: number;
  title: string;
  active: boolean;
}

export async function listPool(): Promise<EncounterPoolRow[]> {
  const res = await pool.query<EncounterPoolRow>(
    'SELECT number, title, active FROM random_encounters ORDER BY number',
  );
  return res.rows;
}

export async function setActive(numberValue: number, active: boolean): Promise<EncounterPoolRow> {
  const res = await pool.query<EncounterPoolRow>(
    'UPDATE random_encounters SET active = $1 WHERE number = $2 RETURNING number, title, active',
    [active, numberValue],
  );
  if (res.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  return res.rows[0];
}

/**
 * Roll a random active encounter for a capture and persist a pending instance.
 * Runs inside the caller's transaction. No-op (returns null) if none active.
 */
export async function rollForCapture(
  db: Db,
  submissionId: string,
  teamId: string,
  seasonId: string,
): Promise<number | null> {
  const pick = await db.query<{ number: number }>(
    'SELECT number FROM random_encounters WHERE active = true ORDER BY random() LIMIT 1',
  );
  if (pick.rows.length === 0) return null;
  const number = pick.rows[0].number;
  await db.query(
    `INSERT INTO encounter_instances (submission_id, team_id, season_id, encounter_number)
       VALUES ($1, $2, $3, $4)`,
    [submissionId, teamId, seasonId, number],
  );
  return number;
}

async function snapshot(teamId: string): Promise<TeamSnapshot> {
  const full = await teamStatsService.getFullStats(teamId);
  return {
    stats: full.stats as Record<StatName, number>,
    influence: full.influence,
    experience: full.experience,
    level: full.level,
  };
}

export async function listPending(): Promise<EncounterInstanceView[]> {
  const seasonId = await getActiveSeasonId().catch(() => null);
  const res = await pool.query<{
    id: string;
    team_id: string;
    team_name: string | null;
    encounter_number: number;
    title: string;
    status: 'pending' | 'resolved';
    choice: string | null;
    outcome_text: string | null;
    applied: EncounterEffect | null;
    created_at: string;
    resolved_at: string | null;
  }>(
    `SELECT ei.id, ei.team_id, t.name AS team_name, ei.encounter_number,
            re.title, ei.status, ei.choice, ei.outcome_text, ei.applied,
            ei.created_at, ei.resolved_at
       FROM encounter_instances ei
       JOIN random_encounters re ON re.number = ei.encounter_number
       LEFT JOIN teams t ON t.id = ei.team_id
      WHERE ei.status = 'pending'
        AND ($1::uuid IS NULL OR ei.season_id = $1)
      ORDER BY ei.created_at DESC`,
    [seasonId],
  );

  const views: EncounterInstanceView[] = [];
  for (const row of res.rows) {
    const snap = await snapshot(row.team_id);
    const ev = evaluate(row.encounter_number, row.title, snap);
    views.push({
      id: row.id,
      team_id: row.team_id,
      team_name: row.team_name,
      encounter_number: row.encounter_number,
      status: row.status,
      choice: row.choice,
      outcome_text: row.outcome_text,
      applied: row.applied,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      eval: ev,
    });
  }
  return views;
}

/** Cumulative experience required to reach a given level. */
async function experienceForLevel(level: number): Promise<number> {
  if (level <= 0) return 0;
  const base = await gameSettingsService.getNumber('base_exp_threshold');
  const step = await gameSettingsService.getNumber('exp_step');
  let total = 0;
  for (let i = 0; i < level; i++) total += base + i * step;
  return total;
}

async function applyEffect(teamId: string, effect: EncounterEffect): Promise<void> {
  const full = await teamStatsService.getFullStats(teamId);

  const resources: teamStatsService.AdminResourcesPayload = {};
  if (effect.influence) resources.influence = Math.max(0, full.influence + effect.influence);

  let expTarget = full.experience;
  let expChanged = false;
  if (effect.experience) {
    expTarget = Math.max(0, expTarget + effect.experience);
    expChanged = true;
  }
  if (effect.level) {
    const need = await experienceForLevel(full.level + effect.level);
    expTarget = Math.max(expTarget, need);
    expChanged = true;
  }
  if (expChanged) resources.experience = expTarget;

  if (Object.keys(resources).length > 0) {
    await teamStatsService.adminSetResources(teamId, resources);
  }

  if (effect.stats || effect.zeroStats) {
    const statsPayload: teamStatsService.AdminStatsPayload = {};
    for (const [key, delta] of Object.entries(effect.stats ?? {})) {
      const stat = key as StatName;
      statsPayload[stat] = Math.max(0, full.stats[stat] + (delta ?? 0));
    }
    for (const stat of effect.zeroStats ?? []) {
      statsPayload[stat] = 0;
    }
    await teamStatsService.adminSetStats(teamId, statsPayload);
  }
}

export interface ResolveResult {
  instance: EncounterInstanceView;
}

export async function resolve(instanceId: string, choice?: string): Promise<EncounterInstanceView> {
  const instRes = await pool.query<{
    id: string;
    team_id: string;
    encounter_number: number;
    status: string;
    title: string;
    season_id: string | null;
  }>(
    `SELECT ei.id, ei.team_id, ei.encounter_number, ei.status, ei.season_id, re.title
       FROM encounter_instances ei
       JOIN random_encounters re ON re.number = ei.encounter_number
      WHERE ei.id = $1`,
    [instanceId],
  );
  if (instRes.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  const inst = instRes.rows[0];
  if (inst.status !== 'pending') throw new AppError(409, 'Встреча уже разрешена');

  const snap = await snapshot(inst.team_id);
  const ev = evaluate(inst.encounter_number, inst.title, snap, choice);

  if (ev.choice !== null) {
    throw new AppError(400, 'Требуется выбор игрока');
  }
  const resolution = ev.resolution!;

  if (!resolution.manual) {
    await applyEffect(inst.team_id, resolution.effect);
  }

  await pool.query(
    `UPDATE encounter_instances
        SET status = 'resolved', choice = $1, outcome_text = $2, applied = $3, resolved_at = NOW()
      WHERE id = $4`,
    [choice ?? null, resolution.outcomeText, JSON.stringify(resolution.effect), instanceId],
  );

  const teamRes = await pool.query<{ name: string | null }>('SELECT name FROM teams WHERE id = $1', [inst.team_id]);
  return {
    id: inst.id,
    team_id: inst.team_id,
    team_name: teamRes.rows[0]?.name ?? null,
    encounter_number: inst.encounter_number,
    status: 'resolved',
    choice: choice ?? null,
    outcome_text: resolution.outcomeText,
    applied: resolution.manual ? null : resolution.effect,
    created_at: '',
    resolved_at: new Date().toISOString(),
    eval: ev,
  };
}
