/**
 * Подробная статистика по кубкам: за что именно команде начислена метрика.
 *
 * Каждая метрика в trophy.service — одно число. Проверить его глазами нельзя,
 * поэтому здесь та же величина раскладывается на слагаемые (`breakdown`) и на
 * журнал событий (`events`) с секторами и временем. Все запросы читают ровно те
 * же таблицы и выражения, что и сама метрика: если журнал не сходится с числом,
 * значит разъехались формулы, а не отчёт.
 */

import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  TrophyDetailEvent,
  TrophyDetails,
  TrophyDetailTeam,
  TrophyKey,
} from '../types/trophy';
import {
  TeamMetric,
  computeSeasonTrophies,
  loadOverrides,
  loadTeamMetrics,
  statsOf,
  trophyDefs,
  STREAK_EVENTS_SQL,
} from './trophy.service';
import { TROPHY_STAT_LADDERS, TROPHY_LADDER_TOTAL, rungsUnlocked } from './stat-thresholds';
import { StatName } from '../types/team-stats';

const SECTOR_PREFIX: Record<string, string> = {
  easy: 'L',
  medium: 'С',
  hard: 'А',
  core: 'Я',
};

/**
 * Подпись сектора для журнала. Обычные сектора именуются как на карте (L12,
 * С7, А3, Я1); у особых секторов и баз номера нет — их различают по координатам.
 */
function sectorLabel(row: {
  slug?: string | null;
  number?: number | null;
  is_special?: boolean | null;
  q?: number | null;
  r?: number | null;
}): string {
  if (row.is_special) {
    return row.q != null && row.r != null ? `Особый (${row.q};${row.r})` : 'Особый сектор';
  }
  if (row.number == null && row.q != null && row.r != null) {
    return `(${row.q};${row.r})`;
  }
  const prefix = row.slug ? SECTOR_PREFIX[row.slug] ?? '?' : '?';
  return `${prefix}${row.number ?? ''}`;
}

const STAT_LABEL: Record<StatName, string> = {
  strength: 'Сила',
  intelligence: 'Интеллект',
  endurance: 'Выносливость',
  leadership: 'Лидерство',
  luck: 'Удача',
};

const PENALTY_LABEL: Record<string, string> = {
  drop: 'Сброс захвата',
  teleport: 'Телепорт',
  diversion_no_reward: 'Диверсия: сектор без награды',
  diversion: 'Диверсия',
};

function penaltyLabel(reason: string): string {
  return PENALTY_LABEL[reason] ?? `Штраф: ${reason}`;
}

export const TROPHY_RULES: Record<TrophyKey, string> = {
  influential:
    'Сумма влияния: награда каждого удерживаемого сектора (с учётом множителя награды) + половина награды за каждый уровень укрепления на нём + бандлы за места в особых событиях − штрафы (сброс захвата, телепорт, диверсии) + ручные корректировки председателя и случайных встреч. Потеря сектора снимает и базу, и бонус за укрепление.',
  core_keepers:
    'Владелец сектора-ядра — 1-е место, все остальные — последнее (равно числу команд). Если ядро свободно, первого места нет ни у кого.',
  experienced:
    'Сумма опыта: награда за каждый захват по журналу sector_captures (заработанное не сгорает при потере сектора) + половина награды за каждый поднятый уровень укрепления + бандлы за места в особых событиях − штрафы + ручные корректировки.',
  rulers:
    'Число секторов, которыми команда владеет прямо сейчас (captured_by_team_id). Считаются и обычные, и база, и захваченные особые.',
  universal: `Число открытых порогов характеристик из ${TROPHY_LADDER_TOTAL} возможных. Пороги — те же, что дают игровые эффекты: сила ${TROPHY_STAT_LADDERS.strength.join('/')}, выносливость ${TROPHY_STAT_LADDERS.endurance.join('/')}, интеллект ${TROPHY_STAT_LADDERS.intelligence.join('/')}, удача ${TROPHY_STAT_LADDERS.luck.join('/')}; у лидерства механических порогов нет, поэтому берутся сложности его проверок в случайных встречах (${TROPHY_STAT_LADDERS.leadership.join('/')}). Кубок награждает разносторонность, а не объём: вложенные в одну характеристику очки быстро упираются в потолок её лестницы. Тайбрейк — общее число вложенных очков.`,
  unbreakable:
    'Самый длинный ряд успехов подряд без сброса захвата. Успех = одобренный захват, одобренный перезахват, поднятый уровень укрепления или 1-е место в особом событии. Сброс захвата (drop) закрывает текущий ряд и открывает новый; ранее достигнутый максимум сохраняется.',
  conquerors:
    'Число одобренных перезахватов — сколько раз команда отобрала сектор у другой. Сброс захвата счётчик не обнуляет.',
  champions:
    'Число побед в особых событиях — сколько особых секторов команда взяла первым местом. Тайбрейк — очки за все занятые места (1-е → 8 … 8-е → 1).',
};

const VALUE_LABEL: Record<TrophyKey, string> = {
  influential: 'Влияние',
  core_keepers: 'Ядро',
  experienced: 'Опыт',
  rulers: 'Секторов',
  universal: 'Порогов',
  unbreakable: 'Лучший ряд',
  conquerors: 'Перезахватов',
  champions: 'Побед',
};

type ByTeam<T> = Map<string, T[]>;

function group<T extends { team_id: string }>(rows: T[]): ByTeam<T> {
  const map: ByTeam<T> = new Map();
  for (const row of rows) {
    const list = map.get(row.team_id);
    if (list) list.push(row);
    else map.set(row.team_id, [row]);
  }
  return map;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/* ------------------------------------------------------------------ */
/* Influence / experience                                              */
/* ------------------------------------------------------------------ */

interface ScoreParts {
  team_id: string;
  sectors: number;
  fortification: number;
  special: number;
  penalties: number;
  adjustments: number;
}

/**
 * Разбивка влияния и опыта — покомпонентные копии выражений из score-sql.
 * Слагаемые агрегируются ровно так же (ROUND от суммы, а не сумма округлений),
 * поэтому их сумма совпадает с числом кубка до отсечения по нулю.
 */
async function loadInfluenceParts(seasonId: string): Promise<ScoreParts[]> {
  const res = await pool.query<ScoreParts>(
    `SELECT t.id AS team_id,
       COALESCE((SELECT ROUND(SUM(dl.influence_reward * s.reward_multiplier))
                   FROM sectors s JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                  WHERE s.captured_by_team_id = t.id
                    AND s.is_special = false AND s.no_reward = false), 0)::int AS sectors,
       COALESCE((SELECT SUM(FLOOR(dl.influence_reward * s.reward_multiplier / 2) * s.fortification_level)
                   FROM sectors s JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                  WHERE s.captured_by_team_id = t.id
                    AND s.is_special = false AND s.no_reward = false), 0)::int AS fortification,
       COALESCE((SELECT SUM(influence) FROM special_sector_awards WHERE team_id = t.id), 0)::int AS special,
       COALESCE((SELECT SUM(influence) FROM team_penalties WHERE team_id = t.id), 0)::int AS penalties,
       COALESCE((SELECT influence_delta FROM team_adjustments WHERE team_id = t.id), 0)::int AS adjustments
     FROM teams t WHERE t.season_id = $1`,
    [seasonId],
  );
  return res.rows;
}

async function loadExperienceParts(seasonId: string): Promise<ScoreParts[]> {
  const res = await pool.query<ScoreParts>(
    `SELECT t.id AS team_id,
       COALESCE((SELECT ROUND(SUM(dl.experience_reward * s.reward_multiplier))
                   FROM sector_captures sc
                   JOIN sectors s ON s.id = sc.sector_id
                   JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                  WHERE sc.team_id = t.id AND s.is_special = false), 0)::int AS sectors,
       COALESCE((SELECT SUM(FLOOR(dl.experience_reward * s.reward_multiplier / 2))
                   FROM sector_fortification_awards fa
                   JOIN sectors s ON s.id = fa.sector_id
                   JOIN difficulty_levels dl ON dl.id = s.difficulty_id
                  WHERE fa.team_id = t.id AND s.is_special = false), 0)::int AS fortification,
       COALESCE((SELECT SUM(experience) FROM special_sector_awards WHERE team_id = t.id), 0)::int AS special,
       COALESCE((SELECT SUM(experience) FROM team_penalties WHERE team_id = t.id), 0)::int AS penalties,
       COALESCE((SELECT experience_delta FROM team_adjustments WHERE team_id = t.id), 0)::int AS adjustments
     FROM teams t WHERE t.season_id = $1`,
    [seasonId],
  );
  return res.rows;
}

interface OwnedSectorRow {
  team_id: string;
  slug: string;
  number: number | null;
  is_special: boolean;
  is_home_base: boolean;
  no_reward: boolean;
  fortification_level: number;
  q: number;
  r: number;
  influence: number;
  fort_influence: number;
  difficulty_name: string;
}

async function loadOwnedSectors(seasonId: string): Promise<OwnedSectorRow[]> {
  const res = await pool.query<OwnedSectorRow>(
    `SELECT s.captured_by_team_id AS team_id,
            dl.slug, dl.name AS difficulty_name, s.number,
            s.is_special, s.is_home_base, s.no_reward, s.fortification_level, s.q, s.r,
            CASE WHEN s.is_special OR s.no_reward THEN 0
                 ELSE ROUND(dl.influence_reward * s.reward_multiplier) END::int AS influence,
            CASE WHEN s.is_special OR s.no_reward THEN 0
                 ELSE FLOOR(dl.influence_reward * s.reward_multiplier / 2) * s.fortification_level
            END::int AS fort_influence
       FROM sectors s
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       JOIN teams t ON t.id = s.captured_by_team_id
      WHERE t.season_id = $1
      ORDER BY dl.slug, s.number NULLS FIRST`,
    [seasonId],
  );
  return res.rows;
}

interface CaptureRow {
  team_id: string;
  captured_at: Date;
  slug: string;
  number: number | null;
  is_special: boolean;
  q: number;
  r: number;
  experience: number;
}

async function loadCaptures(seasonId: string): Promise<CaptureRow[]> {
  const res = await pool.query<CaptureRow>(
    `SELECT sc.team_id, sc.captured_at, dl.slug, s.number, s.is_special, s.q, s.r,
            CASE WHEN s.is_special THEN 0
                 ELSE ROUND(dl.experience_reward * s.reward_multiplier) END::int AS experience
       FROM sector_captures sc
       JOIN sectors s ON s.id = sc.sector_id
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       JOIN teams t ON t.id = sc.team_id
      WHERE t.season_id = $1
      ORDER BY sc.captured_at ASC`,
    [seasonId],
  );
  return res.rows;
}

interface FortAwardRow {
  team_id: string;
  awarded_at: Date;
  slug: string;
  number: number | null;
  q: number;
  r: number;
  experience: number;
}

async function loadFortAwards(seasonId: string): Promise<FortAwardRow[]> {
  const res = await pool.query<FortAwardRow>(
    `SELECT fa.team_id, fa.awarded_at, dl.slug, s.number, s.q, s.r,
            CASE WHEN s.is_special THEN 0
                 ELSE FLOOR(dl.experience_reward * s.reward_multiplier / 2) END::int AS experience
       FROM sector_fortification_awards fa
       JOIN sectors s ON s.id = fa.sector_id
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       JOIN teams t ON t.id = fa.team_id
      WHERE t.season_id = $1
      ORDER BY fa.awarded_at ASC`,
    [seasonId],
  );
  return res.rows;
}

interface SpecialAwardRow {
  team_id: string;
  created_at: Date;
  place: number;
  influence: number;
  experience: number;
  q: number;
  r: number;
}

async function loadSpecialAwards(seasonId: string): Promise<SpecialAwardRow[]> {
  const res = await pool.query<SpecialAwardRow>(
    `SELECT ssa.team_id, ssa.created_at, ssa.place, ssa.influence, ssa.experience, s.q, s.r
       FROM special_sector_awards ssa
       JOIN sectors s ON s.id = ssa.sector_id
       JOIN teams t ON t.id = ssa.team_id
      WHERE t.season_id = $1
      ORDER BY ssa.created_at ASC, ssa.place ASC`,
    [seasonId],
  );
  return res.rows;
}

interface PenaltyRow {
  team_id: string;
  created_at: Date;
  reason: string;
  influence: number;
  experience: number;
  slug: string | null;
  number: number | null;
  q: number | null;
  r: number | null;
}

async function loadPenalties(seasonId: string): Promise<PenaltyRow[]> {
  const res = await pool.query<PenaltyRow>(
    `SELECT p.team_id, p.created_at, p.reason, p.influence, p.experience,
            dl.slug, s.number, s.q, s.r
       FROM team_penalties p
       LEFT JOIN sectors s ON s.id = p.sector_id
       LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       JOIN teams t ON t.id = p.team_id
      WHERE t.season_id = $1
      ORDER BY p.created_at ASC`,
    [seasonId],
  );
  return res.rows;
}

/* ------------------------------------------------------------------ */
/* Per-trophy event builders                                           */
/* ------------------------------------------------------------------ */

async function influentialDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const [parts, owned, specials, penalties] = await Promise.all([
    loadInfluenceParts(seasonId),
    loadOwnedSectors(seasonId),
    loadSpecialAwards(seasonId),
    loadPenalties(seasonId),
  ]);
  const partsByTeam = new Map(parts.map((p) => [p.team_id, p]));
  const ownedByTeam = group(owned);
  const specialByTeam = group(specials);
  const penaltyByTeam = group(penalties);

  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const p = partsByTeam.get(team.id) ?? {
      team_id: team.id,
      sectors: 0,
      fortification: 0,
      special: 0,
      penalties: 0,
      adjustments: 0,
    };
    const events: TrophyDetailEvent[] = [];
    for (const s of ownedByTeam.get(team.id) ?? []) {
      const total = s.influence + s.fort_influence;
      events.push({
        at: null,
        kind: 'owned_sector',
        label: `Владение · ${sectorLabel(s)}`,
        detail: [
          s.difficulty_name,
          s.is_home_base ? 'база' : null,
          s.fortification_level > 0 ? `укр. ${s.fortification_level} (+${s.fort_influence})` : null,
          s.no_reward ? 'без награды (диверсия)' : null,
          s.is_special ? 'особый: награда идёт бандлом за место' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        value: total,
      });
    }
    for (const a of specialByTeam.get(team.id) ?? []) {
      events.push({
        at: iso(a.created_at),
        kind: 'special',
        label: `Особое событие · ${sectorLabel({ ...a, is_special: true })}`,
        detail: `${a.place}-е место`,
        value: a.influence,
      });
    }
    for (const pen of penaltyByTeam.get(team.id) ?? []) {
      if (pen.influence === 0) continue;
      events.push({
        at: iso(pen.created_at),
        kind: pen.reason === 'drop' ? 'drop' : 'penalty',
        label: penaltyLabel(pen.reason),
        detail: pen.slug ? sectorLabel(pen) : '',
        value: -pen.influence,
      });
    }
    if (p.adjustments !== 0) {
      events.push({
        at: null,
        kind: 'adjustment',
        label: 'Корректировка',
        detail: 'ручная выдача председателя и результаты случайных встреч',
        value: p.adjustments,
      });
    }
    out.set(team.id, {
      breakdown: [
        { label: 'Секторы', value: p.sectors },
        { label: 'Укрепления', value: p.fortification },
        { label: 'Особые события', value: p.special },
        { label: 'Штрафы', value: -p.penalties },
        { label: 'Корректировки', value: p.adjustments, hint: 'председатель + случайные встречи' },
      ],
      events,
    });
  }
  return out;
}

async function experiencedDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const [parts, captures, forts, specials, penalties] = await Promise.all([
    loadExperienceParts(seasonId),
    loadCaptures(seasonId),
    loadFortAwards(seasonId),
    loadSpecialAwards(seasonId),
    loadPenalties(seasonId),
  ]);
  const partsByTeam = new Map(parts.map((p) => [p.team_id, p]));
  const capturesByTeam = group(captures);
  const fortsByTeam = group(forts);
  const specialByTeam = group(specials);
  const penaltyByTeam = group(penalties);

  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const p = partsByTeam.get(team.id) ?? {
      team_id: team.id,
      sectors: 0,
      fortification: 0,
      special: 0,
      penalties: 0,
      adjustments: 0,
    };
    const events: TrophyDetailEvent[] = [];
    for (const c of capturesByTeam.get(team.id) ?? []) {
      events.push({
        at: iso(c.captured_at),
        kind: 'capture',
        label: `Захват · ${sectorLabel(c)}`,
        detail: c.is_special ? 'особый: опыт идёт бандлом за место' : '',
        value: c.experience,
      });
    }
    for (const f of fortsByTeam.get(team.id) ?? []) {
      events.push({
        at: iso(f.awarded_at),
        kind: 'fortify',
        label: `Укрепление · ${sectorLabel(f)}`,
        detail: 'уровень укрепления',
        value: f.experience,
      });
    }
    for (const a of specialByTeam.get(team.id) ?? []) {
      events.push({
        at: iso(a.created_at),
        kind: 'special',
        label: `Особое событие · ${sectorLabel({ ...a, is_special: true })}`,
        detail: `${a.place}-е место`,
        value: a.experience,
      });
    }
    for (const pen of penaltyByTeam.get(team.id) ?? []) {
      if (pen.experience === 0) continue;
      events.push({
        at: iso(pen.created_at),
        kind: pen.reason === 'drop' ? 'drop' : 'penalty',
        label: penaltyLabel(pen.reason),
        detail: pen.slug ? sectorLabel(pen) : '',
        value: -pen.experience,
      });
    }
    if (p.adjustments !== 0) {
      events.push({
        at: null,
        kind: 'adjustment',
        label: 'Корректировка',
        detail: 'ручная выдача председателя и результаты случайных встреч',
        value: p.adjustments,
      });
    }
    events.sort(byTime);
    out.set(team.id, {
      breakdown: [
        { label: 'Захваты', value: p.sectors },
        { label: 'Укрепления', value: p.fortification },
        { label: 'Особые события', value: p.special },
        { label: 'Штрафы', value: -p.penalties },
        { label: 'Корректировки', value: p.adjustments, hint: 'председатель + случайные встречи' },
      ],
      events,
    });
  }
  return out;
}

function byTime(a: TrophyDetailEvent, b: TrophyDetailEvent): number {
  if (a.at === null && b.at === null) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return a.at.localeCompare(b.at);
}

async function rulersDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const owned = await loadOwnedSectors(seasonId);
  const ownedByTeam = group(owned);
  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const rows = ownedByTeam.get(team.id) ?? [];
    const events = rows.map<TrophyDetailEvent>((s) => ({
      at: null,
      kind: 'owned_sector',
      label: sectorLabel(s),
      detail: [
        s.difficulty_name,
        s.is_home_base ? 'база' : null,
        s.is_special ? 'особый' : null,
        s.fortification_level > 0 ? `укр. ${s.fortification_level}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      value: 1,
    }));
    const count = (slug: string) => rows.filter((r) => r.slug === slug && !r.is_special).length;
    out.set(team.id, {
      breakdown: [
        { label: 'Лёгкие', value: count('easy') },
        { label: 'Средние', value: count('medium') },
        { label: 'Сложные', value: count('hard') },
        { label: 'Ядро', value: count('core') },
        { label: 'Особые', value: rows.filter((r) => r.is_special).length },
      ],
      events,
    });
  }
  return out;
}

async function coreKeepersDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const res = await pool.query<{
    team_id: string | null;
    number: number | null;
    q: number;
    r: number;
    captured_at: Date | null;
  }>(
    `SELECT s.captured_by_team_id AS team_id, s.number, s.q, s.r,
            (SELECT MAX(sc.captured_at) FROM sector_captures sc
              WHERE sc.sector_id = s.id AND sc.team_id = s.captured_by_team_id) AS captured_at
       FROM sectors s
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
      WHERE dl.slug = 'core' AND s.season_id = $1`,
    [seasonId],
  );
  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const mine = res.rows.filter((r) => r.team_id === team.id);
    out.set(team.id, {
      breakdown: [{ label: 'Владеет ядром', value: mine.length > 0 ? 1 : 0 }],
      events: mine.map<TrophyDetailEvent>((r) => ({
        at: iso(r.captured_at),
        kind: 'capture',
        label: `Ядро · ${sectorLabel({ slug: 'core', number: r.number, q: r.q, r: r.r })}`,
        detail: 'сектор удерживается сейчас',
        value: 1,
      })),
    });
  }
  return out;
}

function universalDetails(
  teams: TeamMetric[],
): Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>> {
  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const stats = statsOf(team);
    const statNames = Object.keys(TROPHY_STAT_LADDERS) as StatName[];
    out.set(team.id, {
      breakdown: statNames.map((stat) => ({
        label: STAT_LABEL[stat],
        value: rungsUnlocked(stat, stats[stat]),
        hint: `значение ${stats[stat]} из лестницы ${TROPHY_STAT_LADDERS[stat].join('/')}`,
      })),
      events: statNames.map<TrophyDetailEvent>((stat) => {
        const value = stats[stat];
        const ladder = TROPHY_STAT_LADDERS[stat];
        const open = rungsUnlocked(stat, value);
        const next = ladder.find((rung) => value < rung) ?? null;
        return {
          at: null,
          kind: 'stat',
          label: `${STAT_LABEL[stat]} · ${value}`,
          detail:
            `${open} из ${ladder.length} порогов (${ladder.join(', ')})` +
            (next !== null ? ` · до следующего +${next - value}` : ' · лестница пройдена'),
          value: open,
        };
      }),
    });
  }
  return out;
}

interface StreakEventRow {
  team_id: string;
  ts: Date;
  kind: string;
  slug: string | null;
  number: number | null;
  is_special: boolean;
  q: number | null;
  r: number | null;
}

async function unbreakableDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const eventsRes = await pool.query<StreakEventRow>(
    `SELECT ev.team_id, ev.ts, ev.kind, dl.slug, s.number, s.is_special, s.q, s.r
       FROM teams t
       JOIN LATERAL (${STREAK_EVENTS_SQL('t.id')}) ev ON true
       LEFT JOIN sectors s ON s.id = ev.sector_id
       LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
      WHERE t.season_id = $1
      ORDER BY ev.ts ASC`,
    [seasonId],
  );
  const dropsRes = await pool.query<{ team_id: string; created_at: Date; slug: string | null; number: number | null }>(
    `SELECT p.team_id, p.created_at, dl.slug, s.number, s.q, s.r
       FROM team_penalties p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN sectors s ON s.id = p.sector_id
       LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
      WHERE t.season_id = $1 AND p.reason = 'drop'
      ORDER BY p.created_at ASC`,
    [seasonId],
  );

  const KIND_LABEL: Record<string, string> = {
    capture: 'Захват',
    recapture: 'Перезахват',
    fortify: 'Укрепление',
    special_win: '1-е место в особом событии',
  };

  const eventsByTeam = group(eventsRes.rows);
  const dropsByTeam = group(dropsRes.rows);

  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const merged: Array<{ at: Date; drop: boolean; row: StreakEventRow | { slug: string | null; number: number | null } }> = [
      ...(eventsByTeam.get(team.id) ?? []).map((row) => ({ at: row.ts, drop: false, row })),
      ...(dropsByTeam.get(team.id) ?? []).map((row) => ({ at: row.created_at, drop: true, row })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Пересчитываем ряд ровно так же, как метрика: дроп закрывает сегмент.
    let running = 0;
    let best = 0;
    let drops = 0;
    const events: TrophyDetailEvent[] = [];
    for (const item of merged) {
      if (item.drop) {
        drops += 1;
        events.push({
          at: iso(item.at),
          kind: 'drop',
          label: 'Сброс захвата — ряд прерван',
          detail: `${item.row.slug ? sectorLabel(item.row) + ' · ' : ''}ряд был ${running}`,
          value: 0,
        });
        running = 0;
        continue;
      }
      const row = item.row as StreakEventRow;
      running += 1;
      if (running > best) best = running;
      events.push({
        at: iso(item.at),
        kind: row.kind,
        label: `${KIND_LABEL[row.kind] ?? row.kind}${
          row.slug || row.number != null ? ` · ${sectorLabel(row)}` : ''
        }`,
        detail: `ряд ${running}`,
        value: running,
      });
    }

    out.set(team.id, {
      breakdown: [
        { label: 'Лучший ряд', value: best },
        { label: 'Текущий ряд', value: running },
        { label: 'Сбросов', value: drops },
        { label: 'Всего успехов', value: merged.length - drops },
      ],
      events,
    });
  }
  return out;
}

async function conquerorsDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const res = await pool.query<{
    team_id: string;
    ts: Date;
    slug: string;
    number: number | null;
    is_special: boolean;
    difficulty_name: string;
    previous_owner: string | null;
  }>(
    `SELECT sub.team_id,
            COALESCE(sub.reviewed_at, sub.created_at) AS ts,
            dl.slug, dl.name AS difficulty_name, s.number, s.is_special, s.q, s.r,
            (SELECT prev.name
               FROM sector_captures sc
               JOIN teams prev ON prev.id = sc.team_id
              WHERE sc.sector_id = sub.sector_id
                AND sc.captured_at < COALESCE(sub.reviewed_at, sub.created_at)
              ORDER BY sc.captured_at DESC
              LIMIT 1) AS previous_owner
       FROM task_submissions sub
       JOIN sectors s ON s.id = sub.sector_id
       JOIN difficulty_levels dl ON dl.id = s.difficulty_id
       JOIN teams t ON t.id = sub.team_id
      WHERE t.season_id = $1
        AND sub.status = 'approved'
        AND sub.action_type = 'recapture'
      ORDER BY ts ASC`,
    [seasonId],
  );
  const byTeam = group(res.rows);
  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const rows = byTeam.get(team.id) ?? [];
    const victims = new Map<string, number>();
    for (const r of rows) {
      const key = r.previous_owner ?? 'неизвестно';
      victims.set(key, (victims.get(key) ?? 0) + 1);
    }
    const count = (slug: string) => rows.filter((r) => r.slug === slug).length;
    out.set(team.id, {
      breakdown: [
        { label: 'Лёгкие', value: count('easy') },
        { label: 'Средние', value: count('medium') },
        { label: 'Сложные', value: count('hard') },
        { label: 'Ядро', value: count('core') },
        ...[...victims.entries()].map(([name, n]) => ({
          label: `У «${name}»`,
          value: n,
          hint: 'прежний владелец сектора',
        })),
      ],
      events: rows.map<TrophyDetailEvent>((r) => ({
        at: iso(r.ts),
        kind: 'recapture',
        label: `Перезахват · ${sectorLabel(r)}`,
        detail: `${r.difficulty_name}${r.previous_owner ? ` · отобран у «${r.previous_owner}»` : ''}`,
        value: 1,
      })),
    });
  }
  return out;
}

async function championsDetails(
  seasonId: string,
  teams: TeamMetric[],
): Promise<Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>> {
  const rows = await loadSpecialAwards(seasonId);
  const byTeam = group(rows);
  const out = new Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>();
  for (const team of teams) {
    const mine = byTeam.get(team.id) ?? [];
    const wins = mine.filter((r) => r.place === 1).length;
    const podium = mine.filter((r) => r.place <= 3).length;
    const points = mine.reduce((sum, r) => sum + (9 - r.place), 0);
    out.set(team.id, {
      breakdown: [
        { label: 'Побед (1-е место)', value: wins },
        { label: 'Призовых (1–3)', value: podium },
        { label: 'Участий', value: mine.length },
        { label: 'Очков за места', value: points, hint: 'тайбрейк: 1-е → 8 … 8-е → 1' },
      ],
      events: mine.map<TrophyDetailEvent>((r) => ({
        at: iso(r.created_at),
        kind: r.place === 1 ? 'special_win' : 'special',
        label: `${sectorLabel({ ...r, is_special: true })} · ${r.place}-е место`,
        detail: `+${r.influence} влияния, +${r.experience} опыта`,
        value: r.place === 1 ? 1 : 0,
      })),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */

/**
 * Детальная статистика одного кубка по всем командам сезона. Места и значения
 * берутся из той же сборки, что и обычный ответ /trophies (включая ручного
 * победителя), чтобы отчёт и карточка не могли разойтись.
 */
export async function getTrophyDetails(
  seasonId: string,
  key: TrophyKey,
): Promise<TrophyDetails> {
  const def = trophyDefs().find((d) => d.key === key);
  if (!def) {
    throw new AppError(404, 'Неизвестный кубок');
  }

  const [teams, ranking] = await Promise.all([
    loadTeamMetrics(seasonId),
    computeSeasonTrophies(seasonId, true),
  ]);
  const entries = ranking.trophies.find((t) => t.key === key)?.entries ?? [];
  const entryByTeam = new Map(entries.map((e) => [e.team_id, e]));

  let perTeam: Map<string, Pick<TrophyDetailTeam, 'breakdown' | 'events'>>;
  switch (key) {
    case 'influential':
      perTeam = await influentialDetails(seasonId, teams);
      break;
    case 'experienced':
      perTeam = await experiencedDetails(seasonId, teams);
      break;
    case 'rulers':
      perTeam = await rulersDetails(seasonId, teams);
      break;
    case 'core_keepers':
      perTeam = await coreKeepersDetails(seasonId, teams);
      break;
    case 'universal':
      perTeam = universalDetails(teams);
      break;
    case 'unbreakable':
      perTeam = await unbreakableDetails(seasonId, teams);
      break;
    case 'conquerors':
      perTeam = await conquerorsDetails(seasonId, teams);
      break;
    case 'champions':
      perTeam = await championsDetails(seasonId, teams);
      break;
  }

  const detailTeams: TrophyDetailTeam[] = teams
    .map((team) => {
      const entry = entryByTeam.get(team.id);
      const parts = perTeam.get(team.id) ?? { breakdown: [], events: [] };
      return {
        team_id: team.id,
        team_name: team.name,
        team_color: team.color,
        place: entry?.place ?? teams.length,
        value: entry?.value ?? 0,
        breakdown: parts.breakdown,
        events: parts.events,
      };
    })
    .sort((a, b) => a.place - b.place || a.team_name.localeCompare(b.team_name, 'ru'));

  return {
    key,
    name: def.name,
    rule: TROPHY_RULES[key],
    value_label: VALUE_LABEL[key],
    teams: detailTeams,
  };
}

/** Ручные победители текущего сезона — для председательской страницы. */
export async function getOverrides(seasonId: string) {
  const overrides = await loadOverrides(seasonId);
  return [...overrides.values()];
}
