import { pool } from '../config/db';
import { StatName, TeamStatUpgrade, UpgradeStatDto, TeamFullStats, MerchantType, PurchaseTokens } from '../types/team-stats';
import { Team } from '../types/team';
import { UserPublic } from '../types/user';
import { AppError } from '../types/errors';
import * as gameSettingsService from './game-settings.service';

export async function getInfluence(teamId: string): Promise<number> {
  const result = await pool.query<{ influence: number }>(
    `SELECT GREATEST(
       0,
       (SELECT COALESCE(SUM(dl.influence_reward), 0)
          FROM sectors s
          JOIN difficulty_levels dl ON s.difficulty_id = dl.id
         WHERE s.captured_by_team_id = $1 AND s.is_special = false)
       + COALESCE((SELECT SUM(influence) FROM special_sector_awards WHERE team_id = $1), 0)
       - COALESCE((SELECT SUM(influence) FROM team_penalties WHERE team_id = $1), 0)
       + COALESCE((SELECT influence_delta FROM team_adjustments WHERE team_id = $1), 0)
     )::int AS influence`,
    [teamId]
  );
  return result.rows[0].influence;
}

export async function getExperience(teamId: string): Promise<number> {
  const result = await pool.query<{ experience: number }>(
    `SELECT GREATEST(
       0,
       (SELECT COALESCE(SUM(dl.experience_reward), 0)
          FROM sector_captures sc
          JOIN sectors s ON sc.sector_id = s.id
          JOIN difficulty_levels dl ON dl.id = s.difficulty_id
         WHERE sc.team_id = $1 AND s.is_special = false)
       + COALESCE((SELECT SUM(experience) FROM special_sector_awards WHERE team_id = $1), 0)
       - COALESCE((SELECT SUM(experience) FROM team_penalties WHERE team_id = $1), 0)
       + COALESCE((SELECT experience_delta FROM team_adjustments WHERE team_id = $1), 0)
     )::int AS experience`,
    [teamId]
  );
  return result.rows[0].experience;
}

async function getUpgradePointsDelta(teamId: string): Promise<number> {
  const res = await pool.query<{ delta: number }>(
    `SELECT COALESCE(upgrade_points_delta, 0) AS delta
       FROM team_adjustments WHERE team_id = $1`,
    [teamId],
  );
  return res.rows[0]?.delta ?? 0;
}

export async function calculateLevel(experience: number): Promise<number> {
  const baseExp = await gameSettingsService.getNumber('base_exp_threshold');
  const expStep = await gameSettingsService.getNumber('exp_step');

  let level = 0;
  let remainingExp = experience;
  let threshold = baseExp;

  while (remainingExp >= threshold) {
    remainingExp -= threshold;
    level++;
    threshold += expStep;
  }

  return level;
}

export async function getUpgrades(teamId: string): Promise<Record<StatName, number>> {
  const result = await pool.query<{ stat_name: StatName; count: number }>(
    `SELECT stat_name, COUNT(*)::int as count
     FROM team_stat_upgrades
     WHERE team_id = $1
     GROUP BY stat_name`,
    [teamId]
  );

  const upgrades: Record<StatName, number> = {
    strength: 0,
    intelligence: 0,
    endurance: 0,
    leadership: 0,
    luck: 0,
  };

  for (const row of result.rows) {
    upgrades[row.stat_name] = row.count;
  }

  return upgrades;
}

export async function getPurchaseTokens(teamId: string): Promise<PurchaseTokens> {
  // Only unspent tokens count — a spent token is the collected, used item.
  const result = await pool.query<{ merchant_type: MerchantType; count: number }>(
    `SELECT merchant_type, COUNT(*)::int AS count
     FROM team_purchase_tokens
     WHERE team_id = $1 AND spent_at IS NULL
     GROUP BY merchant_type`,
    [teamId]
  );
  const tokens: PurchaseTokens = { master: 0, saboteur: 0, trader: 0 };
  for (const row of result.rows) {
    tokens[row.merchant_type] = row.count;
  }
  return tokens;
}

export async function getUpgradeCount(teamId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int as count FROM team_stat_upgrades WHERE team_id = $1',
    [teamId]
  );
  return result.rows[0].count;
}

export async function upgradeStat(teamId: string, dto: UpgradeStatDto): Promise<TeamStatUpgrade> {
  const [experience, upgradeCount] = await Promise.all([
    getExperience(teamId),
    getUpgradeCount(teamId),
  ]);

  const level = await calculateLevel(experience);
  const adjustment = await getUpgradePointsDelta(teamId);
  const availablePoints = level - upgradeCount + adjustment;

  if (availablePoints <= 0) {
    throw new AppError(400, 'Нет доступных очков улучшения');
  }

  const maxLevelRes = await pool.query<{ next_level: number }>(
    `SELECT COALESCE(MAX(level), 0) + 1 AS next_level
     FROM team_stat_upgrades WHERE team_id = $1`,
    [teamId]
  );
  const nextLevel = maxLevelRes.rows[0].next_level;

  const result = await pool.query<TeamStatUpgrade>(
    `INSERT INTO team_stat_upgrades (team_id, stat_name, level)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [teamId, dto.stat_name, nextLevel]
  );

  return result.rows[0];
}

export async function getFullStats(teamId: string): Promise<TeamFullStats> {
  const teamResult = await pool.query<Team>(
    'SELECT * FROM teams WHERE id = $1',
    [teamId]
  );
  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }
  const team = teamResult.rows[0];

  const [influence, experience, upgrades, upgradeCount, membersResult, capturedResult, upgradeDelta, purchaseTokens, anchorResult] =
    await Promise.all([
      getInfluence(teamId),
      getExperience(teamId),
      getUpgrades(teamId),
      getUpgradeCount(teamId),
      pool.query<UserPublic>(
        `SELECT id, email, username, team_id, team_role, created_at
         FROM users WHERE team_id = $1`,
        [teamId]
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM sectors WHERE captured_by_team_id = $1`,
        [teamId]
      ),
      getUpgradePointsDelta(teamId),
      getPurchaseTokens(teamId),
      // Movement anchor: the most recently captured sector (home base first).
      pool.query<{ id: string; q: number; r: number }>(
        `SELECT s.id, s.q, s.r
           FROM sector_captures sc
           JOIN sectors s ON s.id = sc.sector_id
          WHERE sc.team_id = $1
          ORDER BY sc.captured_at DESC
          LIMIT 1`,
        [teamId]
      ),
    ]);

  const level = await calculateLevel(experience);
  const availablePoints = Math.max(0, level - upgradeCount + upgradeDelta);

  return {
    id: team.id,
    name: team.name,
    color: team.color,
    influence,
    experience,
    level,
    available_upgrade_points: availablePoints,
    stats: upgrades,
    members: membersResult.rows,
    captured_sectors_count: capturedResult.rows[0].count,
    purchase_tokens: purchaseTokens,
    anchor: anchorResult.rows[0]
      ? {
          sector_id: anchorResult.rows[0].id,
          q: anchorResult.rows[0].q,
          r: anchorResult.rows[0].r,
        }
      : null,
  };
}

const VALID_STAT_NAMES: ReadonlyArray<StatName> = [
  'strength', 'intelligence', 'endurance', 'leadership', 'luck',
];

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new AppError(400, `${label} должно быть целым числом`);
  }
  if (value < 0) {
    throw new AppError(400, `${label} не может быть отрицательным`);
  }
  return value;
}

export interface AdminResourcesPayload {
  influence?: number;
  experience?: number;
  upgrade_points?: number;
}

export async function adminSetResources(
  teamId: string,
  payload: AdminResourcesPayload,
): Promise<TeamFullStats> {
  const teamRes = await pool.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1',
    [teamId],
  );
  if (teamRes.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }

  const adjRes = await pool.query<{
    influence_delta: number;
    experience_delta: number;
    upgrade_points_delta: number;
  }>(
    `SELECT influence_delta, experience_delta, upgrade_points_delta
       FROM team_adjustments WHERE team_id = $1`,
    [teamId],
  );
  const current = adjRes.rows[0] ?? {
    influence_delta: 0,
    experience_delta: 0,
    upgrade_points_delta: 0,
  };

  const [currentInfluence, currentExperience, upgradeCount] = await Promise.all([
    getInfluence(teamId),
    getExperience(teamId),
    getUpgradeCount(teamId),
  ]);

  const rawInfluence = currentInfluence - current.influence_delta;
  const rawExperience = currentExperience - current.experience_delta;

  let newInfluenceDelta = current.influence_delta;
  let newExperienceDelta = current.experience_delta;
  let newUpgradePointsDelta = current.upgrade_points_delta;

  if (payload.influence !== undefined) {
    const target = assertNonNegativeInteger(payload.influence, 'Влияние');
    newInfluenceDelta = target - rawInfluence;
  }
  if (payload.experience !== undefined) {
    const target = assertNonNegativeInteger(payload.experience, 'Опыт');
    newExperienceDelta = target - rawExperience;
  }

  // Level depends on (potentially new) experience target.
  const targetExperience =
    payload.experience !== undefined ? payload.experience : currentExperience;
  const newLevel = await calculateLevel(Math.max(0, targetExperience));
  const rawUpgradePoints = newLevel - upgradeCount;

  if (payload.upgrade_points !== undefined) {
    const target = assertNonNegativeInteger(payload.upgrade_points, 'Очки апгрейда');
    newUpgradePointsDelta = target - rawUpgradePoints;
  }

  await pool.query(
    `INSERT INTO team_adjustments
       (team_id, influence_delta, experience_delta, upgrade_points_delta, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (team_id) DO UPDATE SET
       influence_delta = EXCLUDED.influence_delta,
       experience_delta = EXCLUDED.experience_delta,
       upgrade_points_delta = EXCLUDED.upgrade_points_delta,
       updated_at = NOW()`,
    [teamId, newInfluenceDelta, newExperienceDelta, newUpgradePointsDelta],
  );

  return getFullStats(teamId);
}

export type AdminStatsPayload = Partial<Record<StatName, number>>;

export async function adminSetStats(
  teamId: string,
  payload: AdminStatsPayload,
): Promise<TeamFullStats> {
  const teamRes = await pool.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1',
    [teamId],
  );
  if (teamRes.rows.length === 0) {
    throw new AppError(404, 'Team not found');
  }

  const entries: Array<[StatName, number]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!VALID_STAT_NAMES.includes(key as StatName)) {
      throw new AppError(400, `Неизвестная характеристика: ${key}`);
    }
    entries.push([key as StatName, assertNonNegativeInteger(value, key)]);
  }
  if (entries.length === 0) {
    return getFullStats(teamId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [stat, count] of entries) {
      await client.query(
        'DELETE FROM team_stat_upgrades WHERE team_id = $1 AND stat_name = $2',
        [teamId, stat],
      );
      if (count > 0) {
        const maxRes = await client.query<{ next: number }>(
          `SELECT COALESCE(MAX(level), 0) + 1 AS next
             FROM team_stat_upgrades WHERE team_id = $1`,
          [teamId],
        );
        const start = maxRes.rows[0].next;
        const values: string[] = [];
        const params: Array<string | number> = [teamId, stat];
        for (let i = 0; i < count; i++) {
          values.push(`($1, $2, $${i + 3})`);
          params.push(start + i);
        }
        await client.query(
          `INSERT INTO team_stat_upgrades (team_id, stat_name, level)
             VALUES ${values.join(',')}`,
          params,
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getFullStats(teamId);
}
