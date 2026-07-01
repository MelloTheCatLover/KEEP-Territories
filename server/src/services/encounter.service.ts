import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { StatName } from '../types/team-stats';
import {
  EncounterEffect,
  EncounterInstanceView,
  TeamSnapshot,
} from '../types/encounter';
import { evaluate, describe } from './encounter-engine';
import * as teamStatsService from './team-stats.service';
import * as gameSettingsService from './game-settings.service';
import { getActiveSeasonId } from './season.service';

type Db = Pick<PoolClient, 'query'>;

export interface EncounterPoolRow {
  number: number;
  title: string;
  active: boolean;
  description: string;
  /** Encounters 16, 20-24: the team whose captain triggers the swap. */
  target_team_id: string | null;
  /** true for the swap encounters that support a team binding. */
  supports_target: boolean;
}

const SWAP_NUMBERS = new Set([16, 20, 21, 22, 23, 24]);

type PoolDbRow = { number: number; title: string; active: boolean; target_team_id: string | null };

function toPoolRow(r: PoolDbRow): EncounterPoolRow {
  return {
    ...r,
    description: describe(r.number),
    supports_target: SWAP_NUMBERS.has(r.number),
  };
}

export async function listPool(): Promise<EncounterPoolRow[]> {
  const res = await pool.query<PoolDbRow>(
    'SELECT number, title, active, target_team_id FROM random_encounters ORDER BY number',
  );
  return res.rows.map(toPoolRow);
}

export async function setActive(numberValue: number, active: boolean): Promise<EncounterPoolRow> {
  const res = await pool.query<PoolDbRow>(
    'UPDATE random_encounters SET active = $1 WHERE number = $2 RETURNING number, title, active, target_team_id',
    [active, numberValue],
  );
  if (res.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  return toPoolRow(res.rows[0]);
}

export async function setTarget(numberValue: number, teamId: string | null): Promise<EncounterPoolRow> {
  if (!SWAP_NUMBERS.has(numberValue)) {
    throw new AppError(400, 'Для этой встречи привязка команды не поддерживается');
  }
  if (teamId !== null) {
    const t = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (t.rows.length === 0) throw new AppError(404, 'Команда не найдена');
  }
  const res = await pool.query<PoolDbRow>(
    'UPDATE random_encounters SET target_team_id = $1 WHERE number = $2 RETURNING number, title, active, target_team_id',
    [teamId, numberValue],
  );
  if (res.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  return toPoolRow(res.rows[0]);
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
): Promise<string | null> {
  const pick = await db.query<{ number: number }>(
    'SELECT number FROM random_encounters WHERE active = true ORDER BY random() LIMIT 1',
  );
  if (pick.rows.length === 0) return null;
  const number = pick.rows[0].number;
  const ins = await db.query<{ id: string }>(
    `INSERT INTO encounter_instances (submission_id, team_id, season_id, encounter_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
    [submissionId, teamId, seasonId, number],
  );
  return ins.rows[0].id;
}

async function snapshot(teamId: string): Promise<TeamSnapshot> {
  const full = await teamStatsService.getFullStats(teamId);
  return {
    id: teamId,
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
    target_team_id: string | null;
  }>(
    `SELECT ei.id, ei.team_id, t.name AS team_name, ei.encounter_number,
            re.title, re.target_team_id, ei.status, ei.choice, ei.outcome_text, ei.applied,
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
    const ev = evaluate(row.encounter_number, row.title, snap, undefined, row.target_team_id);
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

export async function getInstanceView(instanceId: string): Promise<EncounterInstanceView | null> {
  const res = await pool.query<{
    id: string;
    team_id: string;
    team_name: string | null;
    encounter_number: number;
    title: string;
    target_team_id: string | null;
    status: 'pending' | 'resolved';
    choice: string | null;
    outcome_text: string | null;
    applied: EncounterEffect | null;
    created_at: string;
    resolved_at: string | null;
  }>(
    `SELECT ei.id, ei.team_id, t.name AS team_name, ei.encounter_number,
            re.title, re.target_team_id, ei.status, ei.choice, ei.outcome_text,
            ei.applied, ei.created_at, ei.resolved_at
       FROM encounter_instances ei
       JOIN random_encounters re ON re.number = ei.encounter_number
       LEFT JOIN teams t ON t.id = ei.team_id
      WHERE ei.id = $1`,
    [instanceId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const snap = await snapshot(row.team_id);
  const ev = evaluate(row.encounter_number, row.title, snap, undefined, row.target_team_id);
  return {
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
  };
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

  if (effect.stats || effect.zeroStats || effect.swapStats) {
    const statsPayload: teamStatsService.AdminStatsPayload = {};
    for (const [key, delta] of Object.entries(effect.stats ?? {})) {
      const stat = key as StatName;
      statsPayload[stat] = Math.max(0, full.stats[stat] + (delta ?? 0));
    }
    if (effect.swapStats) {
      const [a, b] = effect.swapStats;
      statsPayload[a] = full.stats[b];
      statsPayload[b] = full.stats[a];
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
    target_team_id: string | null;
  }>(
    `SELECT ei.id, ei.team_id, ei.encounter_number, ei.status, ei.season_id,
            re.title, re.target_team_id
       FROM encounter_instances ei
       JOIN random_encounters re ON re.number = ei.encounter_number
      WHERE ei.id = $1`,
    [instanceId],
  );
  if (instRes.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  const inst = instRes.rows[0];
  if (inst.status !== 'pending') throw new AppError(409, 'Встреча уже разрешена');

  const snap = await snapshot(inst.team_id);
  const ev = evaluate(inst.encounter_number, inst.title, snap, choice, inst.target_team_id);

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
