import { pool } from '../config/db';
import { GameSettings, GameSettingKey, ActiveLaw, ACTIVE_LAWS } from '../types/game-settings';
import { AppError } from '../types/errors';

export async function get(key: GameSettingKey): Promise<string> {
  const result = await pool.query<GameSettings>(
    'SELECT * FROM game_settings WHERE key = $1',
    [key]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, `Setting "${key}" not found`);
  }
  return result.rows[0].value;
}

export async function getNumber(key: GameSettingKey): Promise<number> {
  const value = await get(key);
  return parseInt(value, 10);
}

export async function set(key: GameSettingKey, value: string): Promise<void> {
  const result = await pool.query(
    'UPDATE game_settings SET value = $1 WHERE key = $2',
    [value, key]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, `Setting "${key}" not found`);
  }
}

/**
 * The single active mechanical law ("generation"). Reading tolerates a missing
 * row (fresh DB before migration 069) by treating it as 'none'.
 */
export async function getActiveLaw(): Promise<ActiveLaw> {
  const result = await pool.query<{ value: string }>(
    `SELECT value FROM game_settings WHERE key = 'active_law'`,
  );
  const value = result.rows[0]?.value;
  return ACTIVE_LAWS.includes(value as ActiveLaw) ? (value as ActiveLaw) : 'none';
}

/**
 * Activate a law — this archives whatever was active before (single slot).
 * Passing 'none' clears the active law.
 */
export async function setActiveLaw(law: ActiveLaw): Promise<void> {
  await pool.query(
    `INSERT INTO game_settings (key, value) VALUES ('active_law', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [law],
  );
}

export async function getAll(): Promise<GameSettings[]> {
  const result = await pool.query<GameSettings>(
    'SELECT * FROM game_settings ORDER BY key'
  );
  return result.rows;
}

/**
 * Toggle the ×1.5 reward flag. Enabling it boosts every sector captured today
 * (their latest capture is on the current day) and sets the global multiplier so
 * further captures snapshot 1.5 as they happen; disabling clears the boost from
 * all sectors. The core never gets the ×1.5 — it is excluded here and in the
 * capture snapshot. Returns how many sectors changed.
 */
export async function setRewardBoost(enabled: boolean): Promise<{ enabled: boolean; boosted: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE game_settings SET value = $1 WHERE key = 'reward_multiplier'`,
      [enabled ? '1.5' : '1'],
    );

    let boosted = 0;
    if (enabled) {
      const res = await client.query(
        `UPDATE sectors s SET reward_multiplier = 1.5
          WHERE s.captured_by_team_id IS NOT NULL
            AND s.reward_multiplier <> 1.5
            AND s.difficulty_id NOT IN (SELECT id FROM difficulty_levels WHERE slug = 'core')
            AND EXISTS (
              SELECT 1 FROM sector_captures sc
               WHERE sc.sector_id = s.id
                 AND sc.team_id = s.captured_by_team_id
                 AND sc.captured_at >= date_trunc('day', now())
            )`,
      );
      boosted = res.rowCount ?? 0;
    } else {
      const res = await client.query(
        `UPDATE sectors SET reward_multiplier = 1 WHERE reward_multiplier <> 1`,
      );
      boosted = res.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return { enabled, boosted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
