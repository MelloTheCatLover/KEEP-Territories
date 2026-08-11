import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { getActiveSeasonId } from './season.service';
import { influenceExpr, experienceExpr } from './score-sql';
import { thresholdCoverage } from './stat-thresholds';
import { StatName } from '../types/team-stats';
import {
  OverallEntry,
  TrophiesResponse,
  TrophyEntry,
  TrophyKey,
  TrophyRanking,
} from '../types/trophy';

export interface TeamMetric {
  id: string;
  name: string;
  color: string | null;
  influence: number;
  experience: number;
  captured_count: number;
  /** Сырая сумма вложенных очков — тайбрейк «Универсальных» и справочная цифра. */
  stat_sum: number;
  stat_strength: number;
  stat_intelligence: number;
  stat_endurance: number;
  stat_leadership: number;
  stat_luck: number;
  owns_core: boolean;
  streak: number;
  recaptures: number;
  /** Число первых мест в особых событиях — метрика «Чемпионов». */
  special_wins: number;
  /** Очки за места (1-е → 8 … 8-е → 1) — тайбрейк «Чемпионов». */
  special_points: number;
}

export function statsOf(team: TeamMetric): Record<StatName, number> {
  return {
    strength: team.stat_strength,
    intelligence: team.stat_intelligence,
    endurance: team.stat_endurance,
    leadership: team.stat_leadership,
    luck: team.stat_luck,
  };
}

type TrophyDef =
  | {
      key: TrophyKey;
      name: string;
      description: string;
      private_value: boolean;
      type: 'value';
      /** Основная метрика — она же показывается в колонке «Значение». */
      value: (t: TeamMetric) => number;
      /** Разводит команды с равной метрикой; на показ не идёт. */
      tiebreak?: (t: TeamMetric) => number;
    }
  | {
      key: TrophyKey;
      name: string;
      description: string;
      private_value: boolean;
      type: 'core';
    };

const TROPHY_DEFS: TrophyDef[] = [
  {
    key: 'influential',
    name: 'Влиятельные',
    description: 'Команда с наибольшим влиянием',
    private_value: false,
    type: 'value',
    value: (t) => t.influence,
  },
  {
    key: 'core_keepers',
    name: 'Хранители ядра',
    description: 'Владелец ядра — первое место, остальные — последнее',
    private_value: false,
    type: 'core',
  },
  {
    key: 'experienced',
    name: 'Опытные',
    description: 'Команда с наибольшим опытом',
    private_value: false,
    type: 'value',
    value: (t) => t.experience,
  },
  {
    key: 'rulers',
    name: 'Правители',
    description: 'Команда с наибольшим числом захваченных секторов',
    private_value: false,
    type: 'value',
    value: (t) => t.captured_count,
  },
  {
    key: 'universal',
    name: 'Универсальные',
    description: 'Число открытых порогов характеристик',
    private_value: false,
    type: 'value',
    value: (t) => thresholdCoverage(statsOf(t)),
    tiebreak: (t) => t.stat_sum,
  },
  {
    key: 'unbreakable',
    name: 'Несгибаемые',
    description: 'Самый длинный ряд успехов без сброса захвата',
    private_value: true,
    type: 'value',
    value: (t) => t.streak,
  },
  {
    key: 'conquerors',
    name: 'Захватчики',
    description: 'Сколько раз команда отобрала сектор у другой',
    private_value: true,
    type: 'value',
    value: (t) => t.recaptures,
  },
  {
    key: 'champions',
    name: 'Чемпионы',
    description: 'Число побед (первых мест) в особых событиях',
    private_value: false,
    type: 'value',
    value: (t) => t.special_wins,
    tiebreak: (t) => t.special_points,
  },
];

export function trophyDefs(): ReadonlyArray<{
  key: TrophyKey;
  name: string;
  description: string;
  private_value: boolean;
}> {
  return TROPHY_DEFS.map(({ key, name, description, private_value }) => ({
    key,
    name,
    description,
    private_value,
  }));
}

/**
 * Поток «успехов» команды для стрика: одобренные захваты и перехваты, поднятые
 * уровни укрепления и первые места в особых событиях. Один и тот же SQL читают
 * и метрика кубка, и детальная статистика — расхождение между ними означало бы,
 * что журнал не объясняет цифру.
 */
export const STREAK_EVENTS_SQL = (team: string) => `
  SELECT COALESCE(sub.reviewed_at, sub.created_at) AS ts,
         sub.action_type AS kind,
         sub.sector_id
    FROM task_submissions sub
   WHERE sub.team_id = ${team}
     AND sub.status = 'approved'
     AND sub.action_type IN ('capture', 'recapture')
  UNION ALL
  SELECT fa.awarded_at AS ts, 'fortify' AS kind, fa.sector_id
    FROM sector_fortification_awards fa
   WHERE fa.team_id = ${team}
  UNION ALL
  SELECT ssa.created_at AS ts, 'special_win' AS kind, ssa.sector_id
    FROM special_sector_awards ssa
   WHERE ssa.team_id = ${team} AND ssa.place = 1
`;

const METRICS_QUERY = `
  SELECT
    t.id,
    t.name,
    t.color,
    ${influenceExpr('t.id')} AS influence,
    ${experienceExpr('t.id')} AS experience,
    COALESCE((
      SELECT COUNT(*) FROM sectors WHERE captured_by_team_id = t.id
    ), 0)::int AS captured_count,
    COALESCE((
      SELECT COUNT(*) FROM team_stat_upgrades WHERE team_id = t.id
    ), 0)::int AS stat_sum,
    COALESCE((SELECT COUNT(*) FROM team_stat_upgrades u
               WHERE u.team_id = t.id AND u.stat_name = 'strength'), 0)::int AS stat_strength,
    COALESCE((SELECT COUNT(*) FROM team_stat_upgrades u
               WHERE u.team_id = t.id AND u.stat_name = 'intelligence'), 0)::int AS stat_intelligence,
    COALESCE((SELECT COUNT(*) FROM team_stat_upgrades u
               WHERE u.team_id = t.id AND u.stat_name = 'endurance'), 0)::int AS stat_endurance,
    COALESCE((SELECT COUNT(*) FROM team_stat_upgrades u
               WHERE u.team_id = t.id AND u.stat_name = 'leadership'), 0)::int AS stat_leadership,
    COALESCE((SELECT COUNT(*) FROM team_stat_upgrades u
               WHERE u.team_id = t.id AND u.stat_name = 'luck'), 0)::int AS stat_luck,
    EXISTS(
      SELECT 1 FROM sectors s
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       WHERE s.captured_by_team_id = t.id AND dl.slug = 'core'
    ) AS owns_core,
    -- Стрик = самый длинный ряд успехов за сезон. Дропы делят таймлайн на
    -- сегменты (seg = число дропов до события); дроп фиксирует прошлый максимум
    -- и начинает новый сегмент, а не обнуляет достижение.
    COALESCE((
      SELECT MAX(seg_count) FROM (
        SELECT COUNT(*) AS seg_count
        FROM (
          SELECT (
            SELECT COUNT(*) FROM team_penalties p
             WHERE p.team_id = t.id AND p.reason = 'drop' AND p.created_at < ev.ts
          ) AS seg
          FROM (${STREAK_EVENTS_SQL('t.id')}) ev
        ) tagged
        GROUP BY seg
      ) segs
    ), 0)::int AS streak,
    COALESCE((
      SELECT COUNT(*) FROM task_submissions
       WHERE team_id = t.id
         AND status = 'approved'
         AND action_type = 'recapture'
    ), 0)::int AS recaptures,
    COALESCE((
      SELECT COUNT(*) FROM special_sector_awards ssa
       WHERE ssa.team_id = t.id AND ssa.place = 1
    ), 0)::int AS special_wins,
    COALESCE((
      SELECT SUM(9 - ssa.place) FROM special_sector_awards ssa WHERE ssa.team_id = t.id
    ), 0)::int AS special_points
  FROM teams t
  WHERE t.season_id = $1
  ORDER BY t.created_at ASC
`;

/**
 * Competition rank по паре (метрика, тайбрейк): одинаковое место получают только
 * команды, совпавшие по обоим значениям.
 */
function competitionRank(
  teams: TeamMetric[],
  getValue: (t: TeamMetric) => number,
  getTiebreak: (t: TeamMetric) => number,
): Map<string, number> {
  const sorted = [...teams].sort(
    (a, b) => getValue(b) - getValue(a) || getTiebreak(b) - getTiebreak(a),
  );
  const places = new Map<string, number>();
  let lastKey: string | null = null;
  let lastPlace = 0;
  sorted.forEach((team, index) => {
    const key = `${getValue(team)}:${getTiebreak(team)}`;
    let place: number;
    if (lastKey !== null && key === lastKey) {
      place = lastPlace;
    } else {
      place = index + 1;
      lastPlace = place;
      lastKey = key;
    }
    places.set(team.id, place);
  });
  return places;
}

export interface TrophyOverride {
  trophy_key: TrophyKey;
  team_id: string;
  note: string | null;
}

function buildTrophy(
  def: TrophyDef,
  teams: TeamMetric[],
  viewerTeamId: string | null,
  showAllValues: boolean,
  override: TrophyOverride | null,
): TrophyRanking {
  const totalTeams = teams.length;

  const placeMap = new Map<string, number>();
  const valueMap = new Map<string, number>();

  if (def.type === 'core') {
    teams.forEach((t) => {
      placeMap.set(t.id, t.owns_core ? 1 : Math.max(1, totalTeams));
      valueMap.set(t.id, t.owns_core ? 1 : 0);
    });
  } else {
    const getValue = def.value;
    const getTiebreak = def.tiebreak ?? (() => 0);
    const ranks = competitionRank(teams, getValue, getTiebreak);
    teams.forEach((t) => {
      placeMap.set(t.id, ranks.get(t.id) ?? totalTeams);
      valueMap.set(t.id, getValue(t));
    });
  }

  // Ручной победитель: назначенная команда встаёт на 1-е место, остальные
  // пересчитываются между собой по обычной метрике и сдвигаются на позицию вниз.
  const forcedTeamId =
    override && teams.some((t) => t.id === override.team_id) ? override.team_id : null;
  if (forcedTeamId) {
    const rest = teams.filter((t) => t.id !== forcedTeamId);
    const restRanks =
      def.type === 'core'
        ? new Map(rest.map((t) => [t.id, t.owns_core ? 1 : Math.max(1, rest.length)]))
        : competitionRank(rest, def.value, def.tiebreak ?? (() => 0));
    placeMap.set(forcedTeamId, 1);
    rest.forEach((t) => placeMap.set(t.id, (restRanks.get(t.id) ?? rest.length) + 1));
  }

  const entries: TrophyEntry[] = teams
    .map<TrophyEntry>((t) => {
      const value = valueMap.get(t.id) ?? 0;
      const hide = !showAllValues && def.private_value && t.id !== viewerTeamId;
      return {
        team_id: t.id,
        team_name: t.name,
        team_color: t.color,
        place: placeMap.get(t.id) ?? totalTeams,
        value: hide ? null : value,
      };
    })
    .sort((a, b) => a.place - b.place || a.team_name.localeCompare(b.team_name, 'ru'));

  return {
    key: def.key,
    name: def.name,
    description: def.description,
    private_value: def.private_value,
    entries,
    override: forcedTeamId
      ? { team_id: forcedTeamId, note: override?.note ?? null }
      : null,
  };
}

function buildOverall(
  teams: TeamMetric[],
  trophies: TrophyRanking[],
): OverallEntry[] {
  const trophiesWon = new Map<string, number>();
  const sumPlaces = new Map<string, number>();
  for (const t of teams) {
    trophiesWon.set(t.id, 0);
    sumPlaces.set(t.id, 0);
  }
  for (const trophy of trophies) {
    for (const entry of trophy.entries) {
      if (entry.place === 1) {
        trophiesWon.set(entry.team_id, (trophiesWon.get(entry.team_id) ?? 0) + 1);
      }
      sumPlaces.set(
        entry.team_id,
        (sumPlaces.get(entry.team_id) ?? 0) + entry.place,
      );
    }
  }

  const ordered = teams
    .map((t) => ({
      team_id: t.id,
      team_name: t.name,
      team_color: t.color,
      trophies_won: trophiesWon.get(t.id) ?? 0,
      sum_of_places: sumPlaces.get(t.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.trophies_won !== a.trophies_won) return b.trophies_won - a.trophies_won;
      if (a.sum_of_places !== b.sum_of_places) return a.sum_of_places - b.sum_of_places;
      return a.team_name.localeCompare(b.team_name, 'ru');
    });

  let lastKey: string | null = null;
  let lastPlace = 0;
  return ordered.map((row, index) => {
    const key = `${row.trophies_won}:${row.sum_of_places}`;
    let place: number;
    if (lastKey !== null && key === lastKey) {
      place = lastPlace;
    } else {
      place = index + 1;
      lastPlace = place;
      lastKey = key;
    }
    return { ...row, place };
  });
}

export async function loadTeamMetrics(seasonId: string): Promise<TeamMetric[]> {
  const res = await pool.query<TeamMetric>(METRICS_QUERY, [seasonId]);
  return res.rows;
}

export async function loadOverrides(
  seasonId: string,
): Promise<Map<TrophyKey, TrophyOverride>> {
  const res = await pool.query<{ trophy_key: TrophyKey; team_id: string; note: string | null }>(
    'SELECT trophy_key, team_id, note FROM trophy_overrides WHERE season_id = $1',
    [seasonId],
  );
  return new Map(res.rows.map((row) => [row.trophy_key, row]));
}

/** Назначить или снять (team_id = null) ручного победителя кубка. */
export async function setOverride(
  seasonId: string,
  trophyKey: TrophyKey,
  teamId: string | null,
  note: string | null,
  adminId: string,
): Promise<void> {
  if (!TROPHY_DEFS.some((def) => def.key === trophyKey)) {
    throw new AppError(400, 'Неизвестный кубок');
  }
  if (teamId === null) {
    await pool.query(
      'DELETE FROM trophy_overrides WHERE season_id = $1 AND trophy_key = $2',
      [seasonId, trophyKey],
    );
    return;
  }
  const teamRes = await pool.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1 AND season_id = $2',
    [teamId, seasonId],
  );
  if (teamRes.rows.length === 0) {
    throw new AppError(400, 'Команда не найдена в этом сезоне');
  }
  await pool.query(
    `INSERT INTO trophy_overrides (season_id, trophy_key, team_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (season_id, trophy_key) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       note = EXCLUDED.note,
       created_by = EXCLUDED.created_by,
       updated_at = NOW()`,
    [seasonId, trophyKey, teamId, note, adminId],
  );
}

/**
 * Overall standings for any season (active or archived). Place 1 is the season
 * champion. Independent of the viewer — used by team distribution to derive a
 * child's "winner" category from past seasons.
 */
export async function computeOverall(seasonId: string): Promise<OverallEntry[]> {
  const [teams, overrides] = await Promise.all([
    loadTeamMetrics(seasonId),
    loadOverrides(seasonId),
  ]);
  if (teams.length === 0) return [];
  const trophies = TROPHY_DEFS.map((def) =>
    buildTrophy(def, teams, null, true, overrides.get(def.key) ?? null),
  );
  return buildOverall(teams, trophies);
}

/**
 * Trophies for an arbitrary season, no viewer context. Used by the public season
 * archive: once a season is archived the game is over, so every value is revealed
 * (including the normally-private streak/recapture counts). For a still-active or
 * draft season the private values stay hidden.
 */
export async function computeSeasonTrophies(
  seasonId: string,
  revealAll: boolean,
): Promise<TrophiesResponse> {
  const [teams, overrides] = await Promise.all([
    loadTeamMetrics(seasonId),
    loadOverrides(seasonId),
  ]);
  if (teams.length === 0) {
    return { trophies: [], overall: [] };
  }
  const trophies = TROPHY_DEFS.map((def) =>
    buildTrophy(def, teams, null, revealAll, overrides.get(def.key) ?? null),
  );
  const overall = buildOverall(teams, trophies);
  return { trophies, overall };
}

export async function getSeasonTrophies(seasonId: string): Promise<TrophiesResponse> {
  const seasonRes = await pool.query<{ status: string }>(
    'SELECT status FROM seasons WHERE id = $1',
    [seasonId],
  );
  if (seasonRes.rows.length === 0) {
    throw new AppError(404, 'Сезон не найден');
  }
  return computeSeasonTrophies(seasonId, seasonRes.rows[0].status === 'archived');
}

export async function getTrophies(userId: string): Promise<TrophiesResponse> {
  const userRes = await pool.query<{ team_id: string | null; role: 'admin' | 'student' }>(
    'SELECT team_id, role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  const { team_id: viewerTeamId, role } = userRes.rows[0];
  const showAllValues = role === 'admin';

  const seasonId = await getActiveSeasonId();
  const [teams, overrides] = await Promise.all([
    loadTeamMetrics(seasonId),
    loadOverrides(seasonId),
  ]);
  if (teams.length === 0) {
    return { trophies: [], overall: [] };
  }

  const trophies = TROPHY_DEFS.map((def) =>
    buildTrophy(def, teams, viewerTeamId, showAllValues, overrides.get(def.key) ?? null),
  );
  const overall = buildOverall(teams, trophies);
  return { trophies, overall };
}
