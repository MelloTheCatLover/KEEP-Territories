import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { StatName } from '../types/team-stats';
import {
  EncounterEffect,
  EncounterInstanceView,
  TeamSnapshot,
} from '../types/encounter';
import { RosterBinding, describe, evaluate, polarityOf, rosterQuestion } from './encounter-engine';
import { CATALOG_BY_NUMBER, ROSTER_NUMBER_BASE, isRosterNumber } from './encounter-catalog';
import * as teamStatsService from './team-stats.service';
import * as gameSettingsService from './game-settings.service';
import { getActiveSeasonId } from './season.service';

type Db = Pick<PoolClient, 'query'>;

export interface EncounterPoolRow {
  number: number;
  title: string;
  active: boolean;
  description: string;
  polarity: 'positive' | 'negative';
  /** 'standard' = catalog encounter, 'roster' = per-team «есть ли в команде …». */
  kind: 'standard' | 'roster';
  /** Roster checks: the team whose champion is named. */
  target_team_id: string | null;
  target_team_name: string | null;
  /** The named winner / MVP of that team. */
  target_person_name: string | null;
  /** true for roster checks, which support (and need) a team binding. */
  supports_target: boolean;
}

/** Stats the roster checks cycle through, so no two teams get the same one. */
const ROSTER_STATS: StatName[] = ['strength', 'intelligence', 'endurance', 'leadership', 'luck'];

type PoolDbRow = {
  number: number;
  title: string;
  active: boolean;
  polarity: 'positive' | 'negative';
  kind: 'standard' | 'roster';
  roster_stat: StatName | null;
  target_team_id: string | null;
  target_team_name: string | null;
  child_name: string | null;
  cap_full: string | null;
  cap_user: string | null;
};

const POOL_SELECT = `
  SELECT re.number, re.title, re.active, re.polarity, re.kind, re.roster_stat, re.target_team_id,
         t.name AS target_team_name,
         ch.full_name AS child_name,
         cap.full_name AS cap_full, cap.username AS cap_user
    FROM random_encounters re
    LEFT JOIN teams t ON t.id = re.target_team_id
    LEFT JOIN children ch ON ch.id = re.target_child_id
    LEFT JOIN users cap ON cap.team_id = re.target_team_id AND cap.team_role = 'captain'
`;

/** Person named in a roster check: the bound child, else the team captain. */
function personName(r: {
  child_name: string | null;
  cap_full: string | null;
  cap_user: string | null;
}): string | null {
  return (r.child_name && r.child_name.trim()) || (r.cap_full && r.cap_full.trim()) || r.cap_user || null;
}

function bindingOf(r: PoolDbRow | RosterDbRow): RosterBinding | null {
  if (r.kind !== 'roster') return null;
  return {
    teamId: r.target_team_id,
    teamName: r.target_team_name ?? null,
    personName: personName(r),
    stat: r.roster_stat ?? 'strength',
  };
}

type RosterDbRow = PoolDbRow;

/** Catalog is the source of truth for titles; the DB copy is a snapshot. */
function titleOf(row: { number: number; title: string; kind: string }, binding: RosterBinding | null): string {
  if (row.kind === 'roster') return rosterQuestion(binding?.personName);
  return CATALOG_BY_NUMBER.get(row.number)?.title ?? row.title;
}

function toPoolRow(r: PoolDbRow): EncounterPoolRow {
  const binding = bindingOf(r);
  return {
    number: r.number,
    title: titleOf(r, binding),
    active: r.active,
    polarity: r.kind === 'roster' ? 'positive' : polarityOf(r.number),
    kind: r.kind,
    target_team_id: r.target_team_id,
    target_team_name: r.target_team_name,
    target_person_name: binding?.personName ?? null,
    description: describe(r.number, binding),
    supports_target: r.kind === 'roster',
  };
}

async function getPoolRow(numberValue: number): Promise<EncounterPoolRow> {
  const res = await pool.query<PoolDbRow>(`${POOL_SELECT} WHERE re.number = $1`, [numberValue]);
  if (res.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  return toPoolRow(res.rows[0]);
}

export async function listPool(): Promise<EncounterPoolRow[]> {
  const res = await pool.query<PoolDbRow>(`${POOL_SELECT} ORDER BY re.kind DESC, re.number`);
  return res.rows.map(toPoolRow);
}

export async function setActive(numberValue: number, active: boolean): Promise<EncounterPoolRow> {
  const res = await pool.query('UPDATE random_encounters SET active = $1 WHERE number = $2', [active, numberValue]);
  if (res.rowCount === 0) throw new AppError(404, 'Встреча не найдена');
  return getPoolRow(numberValue);
}

/* ------------------------------------------------------------ roster checks */

interface ChampionRow {
  team_id: string;
  child_id: string;
  full_name: string;
  category: 'mvp' | 'winner' | 'participant' | 'newbie';
}

/**
 * One champion per team: a child of that team who already took the season
 * (winner) or was its MVP. MVPs win ties, then the first by name; teams with no
 * such history fall back to any participant, and finally to the captain (the
 * check row then names the captain and carries no child binding).
 */
async function championsByTeam(seasonId: string): Promise<Map<string, ChampionRow>> {
  const res = await pool.query<ChampionRow>(
    `SELECT DISTINCT ON (sp.team_id)
            sp.team_id, sp.child_id, c.full_name, sp.category::text AS category
       FROM season_participants sp
       JOIN children c ON c.id = sp.child_id
      WHERE sp.season_id = $1 AND sp.team_id IS NOT NULL
      ORDER BY sp.team_id,
               CASE sp.category WHEN 'mvp' THEN 0 WHEN 'winner' THEN 1 ELSE 2 END,
               c.full_name`,
    [seasonId],
  );
  const byTeam = new Map<string, ChampionRow>();
  for (const row of res.rows) byTeam.set(row.team_id, row);
  return byTeam;
}

export interface RosterSyncResult {
  created: number;
  teams: number;
  /** Teams that have no winner/MVP in the registry — named by captain instead. */
  withoutChampion: string[];
}

/**
 * Rebuild the «если в вашей команде есть …» checks: exactly one per team of the
 * active season, numbered from 901 up, each naming that team's champion. Rows
 * are upserted (numbers are stable slots) and leftovers from a smaller roster
 * are deactivated rather than deleted, because resolved instances reference
 * them.
 */
export async function syncRosterChecks(): Promise<RosterSyncResult> {
  const seasonId = await getActiveSeasonId();
  const teamsRes = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM teams WHERE season_id = $1 ORDER BY created_at, name',
    [seasonId],
  );
  const teams = teamsRes.rows;
  const champions = await championsByTeam(seasonId);
  const withoutChampion: string[] = [];

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const number = ROSTER_NUMBER_BASE + i;
    const champion = champions.get(team.id) ?? null;
    if (!champion || (champion.category !== 'mvp' && champion.category !== 'winner')) {
      withoutChampion.push(team.name);
    }
    const stat = ROSTER_STATS[i % ROSTER_STATS.length];
    await pool.query(
      `INSERT INTO random_encounters
         (number, title, kind, polarity, active, target_team_id, target_child_id, roster_stat)
       VALUES ($1, $2, 'roster', 'positive', true, $3, $4, $5)
       ON CONFLICT (number) DO UPDATE SET
         title = EXCLUDED.title,
         kind = 'roster',
         polarity = 'positive',
         active = true,
         target_team_id = EXCLUDED.target_team_id,
         target_child_id = EXCLUDED.target_child_id,
         roster_stat = EXCLUDED.roster_stat`,
      [
        number,
        `Проверка состава: ${champion?.full_name ?? team.name}`,
        team.id,
        champion?.child_id ?? null,
        stat,
      ],
    );
  }

  // Slots above the current team count belong to a previous, larger season.
  await pool.query(
    `UPDATE random_encounters
        SET active = false, target_team_id = NULL, target_child_id = NULL
      WHERE kind = 'roster' AND number >= $1`,
    [ROSTER_NUMBER_BASE + teams.length],
  );

  return { created: teams.length, teams: teams.length, withoutChampion };
}

/** Re-bind a roster check to another team, re-picking that team's champion. */
export async function setTarget(numberValue: number, teamId: string | null): Promise<EncounterPoolRow> {
  if (!isRosterNumber(numberValue)) {
    throw new AppError(400, 'Для этой встречи привязка команды не поддерживается');
  }
  let childId: string | null = null;
  if (teamId !== null) {
    const t = await pool.query<{ id: string }>('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (t.rows.length === 0) throw new AppError(404, 'Команда не найдена');
    const seasonId = await getActiveSeasonId();
    childId = (await championsByTeam(seasonId)).get(teamId)?.child_id ?? null;
  }
  const res = await pool.query(
    'UPDATE random_encounters SET target_team_id = $1, target_child_id = $2 WHERE number = $3',
    [teamId, childId, numberValue],
  );
  if (res.rowCount === 0) throw new AppError(404, 'Встреча не найдена');
  return getPoolRow(numberValue);
}

/* ---------------------------------------------------------------- instances */

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

type InstanceDbRow = PoolDbRow & {
  id: string;
  team_id: string;
  team_name: string | null;
  encounter_number: number;
  status: 'pending' | 'resolved';
  choice: string | null;
  outcome_text: string | null;
  applied: EncounterEffect | null;
  created_at: string;
  resolved_at: string | null;
};

const INSTANCE_SELECT = `
  SELECT ei.id, ei.team_id, t.name AS team_name, ei.encounter_number,
         ei.status, ei.choice, ei.outcome_text, ei.applied, ei.created_at, ei.resolved_at,
         re.number, re.title, re.active, re.polarity, re.kind, re.roster_stat, re.target_team_id,
         tt.name AS target_team_name,
         ch.full_name AS child_name,
         cap.full_name AS cap_full, cap.username AS cap_user
    FROM encounter_instances ei
    JOIN random_encounters re ON re.number = ei.encounter_number
    LEFT JOIN teams t ON t.id = ei.team_id
    LEFT JOIN teams tt ON tt.id = re.target_team_id
    LEFT JOIN children ch ON ch.id = re.target_child_id
    LEFT JOIN users cap ON cap.team_id = re.target_team_id AND cap.team_role = 'captain'
`;

async function toInstanceView(row: InstanceDbRow): Promise<EncounterInstanceView> {
  const binding = bindingOf(row);
  const snap = await snapshot(row.team_id);
  const ev = evaluate({
    number: row.encounter_number,
    title: titleOf({ number: row.encounter_number, title: row.title, kind: row.kind }, binding),
    team: snap,
    roster: binding,
  });
  return {
    id: row.id,
    team_id: row.team_id,
    team_name: row.team_name,
    target_team_name: row.target_team_name,
    target_person_name: binding?.personName ?? null,
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

export async function listPending(): Promise<EncounterInstanceView[]> {
  const seasonId = await getActiveSeasonId().catch(() => null);
  const res = await pool.query<InstanceDbRow>(
    `${INSTANCE_SELECT}
      WHERE ei.status = 'pending'
        AND ($1::uuid IS NULL OR ei.season_id = $1)
      ORDER BY ei.created_at DESC`,
    [seasonId],
  );
  const views: EncounterInstanceView[] = [];
  for (const row of res.rows) views.push(await toInstanceView(row));
  return views;
}

export async function getInstanceView(instanceId: string): Promise<EncounterInstanceView | null> {
  const res = await pool.query<InstanceDbRow>(`${INSTANCE_SELECT} WHERE ei.id = $1`, [instanceId]);
  if (res.rows.length === 0) return null;
  return toInstanceView(res.rows[0]);
}

/* ------------------------------------------------------------------- effects */

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

    // Stat rows *are* spent upgrade points, so removing them would hand the
    // points straight back (and adding them would silently cost a point).
    // Compensate the pool by the same amount: a wipe burns the points for good,
    // a gift is free. Encounters therefore change stats, not the point budget.
    let pointDrift = 0;
    for (const [key, target] of Object.entries(statsPayload)) {
      pointDrift += (target as number) - full.stats[key as StatName];
    }
    await teamStatsService.adjustUpgradePointsDelta(teamId, pointDrift);
  }
}

export interface ResolveResult {
  instance: EncounterInstanceView;
}

export async function resolve(instanceId: string, choice?: string): Promise<EncounterInstanceView> {
  const instRes = await pool.query<InstanceDbRow>(`${INSTANCE_SELECT} WHERE ei.id = $1`, [instanceId]);
  if (instRes.rows.length === 0) throw new AppError(404, 'Встреча не найдена');
  const inst = instRes.rows[0];
  if (inst.status !== 'pending') throw new AppError(409, 'Встреча уже разрешена');

  const binding = bindingOf(inst);
  const snap = await snapshot(inst.team_id);
  const ev = evaluate({
    number: inst.encounter_number,
    title: titleOf({ number: inst.encounter_number, title: inst.title, kind: inst.kind }, binding),
    team: snap,
    choice,
    roster: binding,
  });

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

  return {
    id: inst.id,
    team_id: inst.team_id,
    team_name: inst.team_name,
    target_team_name: inst.target_team_name,
    target_person_name: binding?.personName ?? null,
    encounter_number: inst.encounter_number,
    status: 'resolved',
    choice: choice ?? null,
    outcome_text: resolution.outcomeText,
    applied: resolution.manual ? null : resolution.effect,
    created_at: inst.created_at,
    resolved_at: new Date().toISOString(),
    eval: ev,
  };
}
