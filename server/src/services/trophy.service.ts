import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { getActiveSeasonId } from './season.service';
import {
  OverallEntry,
  TrophiesResponse,
  TrophyEntry,
  TrophyKey,
  TrophyRanking,
} from '../types/trophy';

interface TeamMetric {
  id: string;
  name: string;
  color: string | null;
  influence: number;
  experience: number;
  captured_count: number;
  stat_sum: number;
  owns_core: boolean;
  streak: number;
  recaptures: number;
  special_events: number;
}

type NumericMetric =
  | 'influence'
  | 'experience'
  | 'captured_count'
  | 'stat_sum'
  | 'streak'
  | 'recaptures'
  | 'special_events';

type TrophyDef =
  | {
      key: TrophyKey;
      name: string;
      description: string;
      private_value: boolean;
      type: 'value';
      metric: NumericMetric;
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
    metric: 'influence',
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
    metric: 'experience',
  },
  {
    key: 'rulers',
    name: 'Правители',
    description: 'Команда с наибольшим числом захваченных секторов',
    private_value: false,
    type: 'value',
    metric: 'captured_count',
  },
  {
    key: 'universal',
    name: 'Универсальные',
    description: 'Сумма характеристик команды',
    private_value: false,
    type: 'value',
    metric: 'stat_sum',
  },
  {
    key: 'unbreakable',
    name: 'Несгибаемые',
    description: 'Самый длинный стрик одобренных захватов без drop-сброса',
    private_value: true,
    type: 'value',
    metric: 'streak',
  },
  {
    key: 'conquerors',
    name: 'Захватчики',
    description: 'Сколько раз команда отобрала сектор у другой',
    private_value: true,
    type: 'value',
    metric: 'recaptures',
  },
  {
    key: 'champions',
    name: 'Чемпионы',
    description: 'Особые события (в разработке)',
    private_value: false,
    type: 'value',
    metric: 'special_events',
  },
];

const METRICS_QUERY = `
  SELECT
    t.id,
    t.name,
    t.color,
    GREATEST(
      0,
      COALESCE((
        SELECT SUM(dl.influence_reward)
          FROM sectors s
          JOIN difficulty_levels dl ON dl.id = s.difficulty_id
         WHERE s.captured_by_team_id = t.id
      ), 0)
      - COALESCE((SELECT SUM(influence) FROM team_penalties WHERE team_id = t.id), 0)
      + COALESCE((SELECT influence_delta FROM team_adjustments WHERE team_id = t.id), 0)
    )::int AS influence,
    GREATEST(
      0,
      COALESCE((
        SELECT SUM(dl.experience_reward)
          FROM sector_captures sc
          JOIN sectors s ON sc.sector_id = s.id
          JOIN difficulty_levels dl ON dl.id = s.difficulty_id
         WHERE sc.team_id = t.id
      ), 0)
      - COALESCE((SELECT SUM(experience) FROM team_penalties WHERE team_id = t.id), 0)
      + COALESCE((SELECT experience_delta FROM team_adjustments WHERE team_id = t.id), 0)
    )::int AS experience,
    COALESCE((
      SELECT COUNT(*) FROM sectors WHERE captured_by_team_id = t.id
    ), 0)::int AS captured_count,
    COALESCE((
      SELECT COUNT(*) FROM team_stat_upgrades WHERE team_id = t.id
    ), 0)::int AS stat_sum,
    EXISTS(
      SELECT 1 FROM sectors s
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       WHERE s.captured_by_team_id = t.id AND dl.slug = 'core'
    ) AS owns_core,
    COALESCE((
      SELECT COUNT(*) FROM task_submissions sub
       WHERE sub.team_id = t.id
         AND sub.status = 'approved'
         AND sub.action_type IN ('capture', 'recapture')
         AND COALESCE(sub.reviewed_at, sub.created_at) > COALESCE(
           (SELECT MAX(created_at) FROM team_penalties
              WHERE team_id = t.id AND reason = 'drop'),
           '1970-01-01 00:00:00+00'::timestamptz
         )
    ), 0)::int AS streak,
    COALESCE((
      SELECT COUNT(*) FROM task_submissions
       WHERE team_id = t.id
         AND status = 'approved'
         AND action_type = 'recapture'
    ), 0)::int AS recaptures,
    0::int AS special_events
  FROM teams t
  WHERE t.season_id = $1
  ORDER BY t.created_at ASC
`;

function competitionRank(
  teams: TeamMetric[],
  getValue: (t: TeamMetric) => number,
): Map<string, number> {
  const sorted = [...teams].sort((a, b) => getValue(b) - getValue(a));
  const places = new Map<string, number>();
  let lastValue: number | null = null;
  let lastPlace = 0;
  sorted.forEach((team, index) => {
    const value = getValue(team);
    let place: number;
    if (lastValue !== null && value === lastValue) {
      place = lastPlace;
    } else {
      place = index + 1;
      lastPlace = place;
      lastValue = value;
    }
    places.set(team.id, place);
  });
  return places;
}

function buildTrophy(
  def: TrophyDef,
  teams: TeamMetric[],
  viewerTeamId: string | null,
  showAllValues: boolean,
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
    const ranks = competitionRank(teams, (t) => t[def.metric]);
    teams.forEach((t) => {
      placeMap.set(t.id, ranks.get(t.id) ?? totalTeams);
      valueMap.set(t.id, t[def.metric]);
    });
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
  const teamsRes = await pool.query<TeamMetric>(METRICS_QUERY, [seasonId]);
  const teams = teamsRes.rows;
  if (teams.length === 0) {
    return { trophies: [], overall: [] };
  }

  const trophies = TROPHY_DEFS.map((def) =>
    buildTrophy(def, teams, viewerTeamId, showAllValues),
  );
  const overall = buildOverall(teams, trophies);
  return { trophies, overall };
}
