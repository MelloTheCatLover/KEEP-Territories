import { pool } from '../config/db';
import { StatName, TeamStatUpgrade, UpgradeStatDto, TeamFullStats } from '../types/team-stats';
import { Team } from '../types/team';
import { UserPublic } from '../types/user';
import { AppError } from '../types/errors';
import * as gameSettingsService from './game-settings.service';

export async function getInfluence(teamId: string): Promise<number> {
  const result = await pool.query<{ influence: number }>(
    `SELECT COALESCE(SUM(dl.influence_reward), 0) as influence
     FROM sectors s
     JOIN difficulty_levels dl ON s.difficulty_id = dl.id
     WHERE s.captured_by_team_id = $1`,
    [teamId]
  );
  return result.rows[0].influence;
}

export async function getExperience(teamId: string): Promise<number> {
  const result = await pool.query<{ experience: number }>(
    `SELECT COALESCE(SUM(dl.experience_reward), 0) as experience
     FROM sector_captures sc
     JOIN sectors s ON sc.sector_id = s.id
     JOIN difficulty_levels dl ON s.difficulty_id = dl.id
     WHERE sc.team_id = $1`,
    [teamId]
  );
  return result.rows[0].experience;
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
  const availablePoints = level - upgradeCount;

  if (availablePoints <= 0) {
    throw new AppError(400, 'Нет доступных очков улучшения');
  }

  const nextLevel = upgradeCount + 1;

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

  const [influence, experience, upgrades, upgradeCount, membersResult, capturedResult] =
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
    ]);

  const level = await calculateLevel(experience);

  return {
    id: team.id,
    name: team.name,
    color: team.color,
    influence,
    experience,
    level,
    available_upgrade_points: level - upgradeCount,
    stats: upgrades,
    members: membersResult.rows,
    captured_sectors_count: capturedResult.rows[0].count,
  };
}
