import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { getActiveSeasonId } from './season.service';
import { MerchantType } from '../types/team-stats';

export interface MerchantSectorRow {
  sector_id: string;
  q: number;
  r: number;
  number: number | null;
  difficulty_slug: string;
  merchant_type: MerchantType;
  captured_by_team_id: string | null;
  captured_by_team_name: string | null;
  captured_by_team_color: string | null;
  /** Token minted for the current owner on capture, if any. */
  token_id: string | null;
  token_spent_at: string | null;
}

/**
 * Every merchant sector of the active season with its current owner and the
 * owner's purchase token state. Admin-only: merchants are hidden from teams, so
 * this is the admin's view of "who landed on a character and still owes a visit".
 */
export async function listMerchantSectors(): Promise<MerchantSectorRow[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<MerchantSectorRow>(
    `SELECT s.id AS sector_id, s.q, s.r, s.number, dl.slug AS difficulty_slug,
            s.merchant_type,
            s.captured_by_team_id,
            t.name AS captured_by_team_name,
            t.color AS captured_by_team_color,
            tok.id AS token_id,
            tok.spent_at AS token_spent_at
       FROM sectors s
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       LEFT JOIN teams t ON t.id = s.captured_by_team_id
       LEFT JOIN team_purchase_tokens tok
              ON tok.sector_id = s.id AND tok.team_id = s.captured_by_team_id
      WHERE s.season_id = $1 AND s.merchant_type IS NOT NULL
      ORDER BY tok.spent_at IS NOT NULL, dl.influence_reward, s.number NULLS LAST`,
    [seasonId],
  );
  return res.rows;
}

/** Mark a team's purchase token as collected & spent. */
export async function spendToken(tokenId: string): Promise<void> {
  const res = await pool.query(
    `UPDATE team_purchase_tokens
        SET spent_at = NOW()
      WHERE id = $1 AND spent_at IS NULL`,
    [tokenId],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Жетон не найден или уже потрачен');
  }
}
