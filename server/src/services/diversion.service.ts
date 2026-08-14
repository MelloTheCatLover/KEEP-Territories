import { Pool, PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  DiversionDef,
  DiversionKind,
  DiversionView,
} from '../types/diversion';
import { Sector } from '../types/sector';
import { getActiveSeasonId } from './season.service';
import * as purchaseService from './purchase.service';

/**
 * Диверсант. Захват его сектора чеканит жетон покупки
 * (`team_purchase_tokens`, merchant_type = 'saboteur'), а этот сервис
 * превращает жетон в игровой эффект: одна диверсия — один жетон.
 *
 * Мгновенные диверсии меняют состояние сразу, «заряженные» ложатся на
 * команду-жертву и ждут её следующего действия (захват / проверка / ход);
 * снимает их движок захватов через `takeArmed` + `consume`.
 *
 * Влияние и опыт диверсии не считают сами: минус идёт в `team_penalties`,
 * снятое укрепление и снятая награда за сектор пересчитываются формулами из
 * `score-sql.ts`. Диверсант с диверсии ничего не зарабатывает — влияние
 * жертвы сгорает, а не перетекает. Стрик диверсии не трогают — полоса
 * остаётся про занятие секторов.
 */

/** Сколько влияния забирает «Забрать пять влияния у соперника». */
const STEAL_INFLUENCE = 5;

export const DIVERSIONS: ReadonlyArray<DiversionDef> = [
  {
    kind: 'trader_point',
    title: 'Очко покупки у следующего торговца',
    description:
      'Команда получает лишний жетон торговца — покупка без захвата его сектора.',
    timing: 'instant',
    needs_target: false,
    needs_sector: false,
  },
  {
    kind: 'strip_fortification',
    title: 'Снятие укреплений с одного сектора на выбор',
    description:
      'Снимает один уровень укрепления с чужого сектора без выполнения задания. Влияние владельца падает сразу, опыт за укрепление не сгорает.',
    timing: 'instant',
    needs_target: false,
    needs_sector: true,
  },
  {
    kind: 'steal_influence',
    title: 'Забрать пять влияния у соперника',
    description: `Минус ${STEAL_INFLUENCE} влияния сопернику. Диверсанту влияние не начисляется.`,
    timing: 'instant',
    needs_target: true,
    needs_sector: false,
  },
  {
    kind: 'hard_reset',
    title: 'Следующий сектор как сложный + откат на базу',
    description:
      'Следующий захват соперника идёт с заданием сложного сектора, а досягаемость считается от его домашней базы.',
    timing: 'armed',
    needs_target: true,
    needs_sector: false,
  },
  {
    kind: 'false_scouting',
    title: 'Следующая проверка покажет ложь',
    description:
      'Следующая проверка соперника вернёт подставной пул заданий. Ложь запоминается: повторный просмотр того же сектора покажет её же.',
    timing: 'armed',
    needs_target: true,
    needs_sector: false,
  },
  {
    kind: 'no_reward',
    title: 'Соперник не получает награду за сектор',
    description:
      'Следующий захват соперника не даст ни влияния, ни опыта — сектор достаётся пустым.',
    timing: 'armed',
    needs_target: true,
    needs_sector: false,
  },
  {
    kind: 'opponent_move',
    title: 'Следующий ход вы совершаете за соперника',
    description:
      'Следующее действие соперника на карте помечается как ход диверсанта: сектор и действие выбирает команда-диверсант.',
    timing: 'armed',
    needs_target: true,
    needs_sector: false,
  },
];

const BY_KIND = new Map(DIVERSIONS.map((d) => [d.kind, d]));

export function getDef(kind: DiversionKind): DiversionDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new AppError(400, 'Неизвестная диверсия');
  return def;
}

function assertKind(value: unknown): DiversionKind {
  if (typeof value !== 'string' || !BY_KIND.has(value as DiversionKind)) {
    throw new AppError(400, 'Неизвестная диверсия');
  }
  return value as DiversionKind;
}

const VIEW_SELECT = `
  SELECT d.id, d.kind, d.status, d.note, d.created_at, d.resolved_at,
         d.caster_team_id, ct.name AS caster_team_name,
         d.target_team_id, tt.name AS target_team_name,
         d.sector_id, s.number AS sector_number, dl.slug AS sector_difficulty_slug
    FROM team_diversions d
    JOIN teams ct ON ct.id = d.caster_team_id
    LEFT JOIN teams tt ON tt.id = d.target_team_id
    LEFT JOIN sectors s ON s.id = d.sector_id
    LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
`;

type ViewRow = Omit<DiversionView, 'title'>;

function toView(row: ViewRow): DiversionView {
  return { ...row, title: getDef(row.kind).title };
}

type Db = Pool | PoolClient;

async function getView(db: Db, id: string): Promise<DiversionView> {
  const res = await db.query<ViewRow>(`${VIEW_SELECT} WHERE d.id = $1`, [id]);
  if (res.rows.length === 0) throw new AppError(404, 'Диверсия не найдена');
  return toView(res.rows[0]);
}

export interface DiversionsResponse {
  /** Заряженные диверсии, ждущие события у жертвы. */
  armed: DiversionView[];
  /** Последние сработавшие / отменённые — журнал для председателя. */
  history: DiversionView[];
}

export async function list(limit = 30): Promise<DiversionsResponse> {
  const seasonId = await getActiveSeasonId();
  const [armed, history] = await Promise.all([
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE d.season_id = $1 AND d.status = 'armed'
        ORDER BY d.created_at ASC`,
      [seasonId],
    ),
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE d.season_id = $1 AND d.status <> 'armed'
        ORDER BY COALESCE(d.resolved_at, d.created_at) DESC
        LIMIT $2`,
      [seasonId, limit],
    ),
  ]);
  return {
    armed: armed.rows.map(toView),
    history: history.rows.map(toView),
  };
}

/** Сколько неистраченных жетонов диверсанта у команды. */
export async function countTokens(teamId: string): Promise<number> {
  const res = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM team_purchase_tokens
      WHERE team_id = $1 AND merchant_type = 'saboteur' AND spent_at IS NULL`,
    [teamId],
  );
  return res.rows[0]?.count ?? 0;
}

/**
 * Списывает самый старый неистраченный жетон диверсанта команды. Блокировка
 * строки не даёт двум параллельным диверсиям уехать на одном жетоне.
 */
async function spendSaboteurToken(client: PoolClient, teamId: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `UPDATE team_purchase_tokens
        SET spent_at = NOW()
      WHERE id = (
        SELECT id FROM team_purchase_tokens
         WHERE team_id = $1 AND merchant_type = 'saboteur' AND spent_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
    [teamId],
  );
  if (res.rows.length === 0) {
    throw new AppError(400, 'У команды нет неистраченных жетонов диверсанта');
  }
  return res.rows[0].id;
}

export interface CastParams {
  casterTeamId: string;
  kind: unknown;
  targetTeamId?: string | null;
  sectorId?: string | null;
}

/** Мгновенный эффект. Возвращает текст для журнала и итоговую цель/сектор. */
async function applyInstant(
  client: PoolClient,
  kind: DiversionKind,
  casterTeamId: string,
  targetTeamId: string | null,
  sectorId: string | null,
): Promise<{ note: string; targetTeamId: string | null; sectorId: string | null }> {
  switch (kind) {
    case 'trader_point': {
      // Плавающий жетон, не привязанный к сектору — как в «Свинском поступке».
      await client.query(
        `INSERT INTO team_purchase_tokens (team_id, sector_id, merchant_type)
         VALUES ($1, NULL, 'trader')`,
        [casterTeamId],
      );
      return { note: 'Выдан жетон торговца', targetTeamId: null, sectorId: null };
    }
    case 'strip_fortification': {
      const secRes = await client.query<Sector>(
        'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
        [sectorId],
      );
      if (secRes.rows.length === 0) throw new AppError(404, 'Сектор не найден');
      const sector = secRes.rows[0];
      if (sector.captured_by_team_id === null) {
        throw new AppError(400, 'Сектор не захвачен');
      }
      if (sector.captured_by_team_id === casterTeamId) {
        throw new AppError(400, 'Нельзя снимать укрепление со своего сектора');
      }
      if (sector.fortification_level <= 0) {
        throw new AppError(400, 'На секторе нет укрепления');
      }
      const next = sector.fortification_level - 1;
      await client.query('UPDATE sectors SET fortification_level = $1 WHERE id = $2', [
        next,
        sector.id,
      ]);
      return {
        note: `Укрепление ${sector.fortification_level} → ${next}`,
        targetTeamId: sector.captured_by_team_id,
        sectorId: sector.id,
      };
    }
    case 'steal_influence': {
      // Влияние соперника сгорает, а не перетекает: диверсанту оно не
      // начисляется. Минус идёт штрафом (как дроп) — influenceExpr его уже
      // вычитает, пересчёт не нужен.
      await client.query(
        `INSERT INTO team_penalties (team_id, influence, experience, reason)
         VALUES ($1, $2, 0, 'diversion')`,
        [targetTeamId, STEAL_INFLUENCE],
      );
      return {
        note: `Влияние −${STEAL_INFLUENCE} сопернику`,
        targetTeamId,
        sectorId: null,
      };
    }
    default:
      throw new AppError(400, 'Эта диверсия не мгновенная');
  }
}

/**
 * Применить диверсию за команду. Одна транзакция: списание жетона и эффект
 * едут вместе, откат снимает обоих.
 */
export async function cast(params: CastParams): Promise<DiversionView> {
  const kind = assertKind(params.kind);
  const def = getDef(kind);
  const targetTeamId = params.targetTeamId || null;
  const sectorId = params.sectorId || null;

  if (def.needs_target && !targetTeamId) {
    throw new AppError(400, 'Нужно выбрать команду-соперника');
  }
  if (def.needs_sector && !sectorId) {
    throw new AppError(400, 'Нужно выбрать сектор');
  }
  if (targetTeamId && targetTeamId === params.casterTeamId) {
    throw new AppError(400, 'Диверсия кидается по сопернику, а не по себе');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);

    const teamsRes = await client.query<{ id: string }>(
      'SELECT id FROM teams WHERE id = ANY($1::uuid[])',
      [[params.casterTeamId, ...(targetTeamId ? [targetTeamId] : [])]],
    );
    if (teamsRes.rows.length !== (targetTeamId ? 2 : 1)) {
      throw new AppError(404, 'Команда не найдена');
    }

    const tokenId = await spendSaboteurToken(client, params.casterTeamId);

    // Товар мастера «ЩИТ» у жертвы гасит диверсию целиком: эффект не
    // срабатывает, но жетон диверсанта уже потрачен — щит стоит жетона.
    const shieldId = targetTeamId
      ? await purchaseService.takeArmed(client, targetTeamId, 'shield')
      : null;
    if (shieldId) {
      await purchaseService.consume(client, shieldId, {
        note: `ЩИТ погасил диверсию «${def.title}»`,
      });
      const blocked = await client.query<{ id: string }>(
        `INSERT INTO team_diversions
           (season_id, kind, caster_team_id, target_team_id, sector_id, token_id, status, note, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'cancelled', $7, NOW())
         RETURNING id`,
        [
          seasonId,
          kind,
          params.casterTeamId,
          targetTeamId,
          sectorId,
          tokenId,
          'Погашена ЩИТом соперника',
        ],
      );
      const view = await getView(client, blocked.rows[0].id);
      await client.query('COMMIT');
      return view;
    }

    let note: string | null = null;
    let finalTarget = targetTeamId;
    let finalSector = sectorId;

    if (def.timing === 'instant') {
      const applied = await applyInstant(
        client,
        kind,
        params.casterTeamId,
        targetTeamId,
        sectorId,
      );
      note = applied.note;
      finalTarget = applied.targetTeamId;
      finalSector = applied.sectorId;
    } else {
      // Две одинаковые «заряженные» диверсии на одной жертве бессмысленны:
      // сработает первая, вторая просто сгорит вместе с жетоном.
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM team_diversions
          WHERE target_team_id = $1 AND kind = $2 AND status = 'armed'`,
        [targetTeamId, kind],
      );
      if (dup.rows.length > 0) {
        throw new AppError(409, 'На этой команде уже висит такая диверсия');
      }
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO team_diversions
         (season_id, kind, caster_team_id, target_team_id, sector_id, token_id, status, note, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        seasonId,
        kind,
        params.casterTeamId,
        finalTarget,
        finalSector,
        tokenId,
        def.timing === 'instant' ? 'applied' : 'armed',
        note,
        def.timing === 'instant' ? new Date() : null,
      ],
    );

    const view = await getView(client, inserted.rows[0].id);
    await client.query('COMMIT');
    return view;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Снять заряженную диверсию, не дожидаясь срабатывания. Жетон не возвращается. */
export async function cancel(id: string): Promise<DiversionView> {
  const res = await pool.query(
    `UPDATE team_diversions
        SET status = 'cancelled', resolved_at = NOW(), note = COALESCE(note, 'Снята председателем')
      WHERE id = $1 AND status = 'armed'`,
    [id],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Заряженная диверсия не найдена');
  }
  return getView(pool, id);
}

/* ── Движок: снятие заряженных диверсий ───────────────────────────────────── */

/**
 * Заряженная диверсия такого вида на команде, если есть. Строка блокируется до
 * конца транзакции вызывающего — два параллельных действия одной команды не
 * снимут одну диверсию дважды.
 */
export async function takeArmed(
  client: PoolClient,
  teamId: string,
  kind: DiversionKind,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM team_diversions
      WHERE target_team_id = $1 AND kind = $2 AND status = 'armed'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [teamId, kind],
  );
  return res.rows[0]?.id ?? null;
}

/** Пометить заряженную диверсию сработавшей. Вызывается в транзакции действия. */
export async function consume(
  client: PoolClient,
  id: string,
  opts: { sectorId?: string | null; note?: string } = {},
): Promise<void> {
  await client.query(
    `UPDATE team_diversions
        SET status = 'consumed',
            resolved_at = NOW(),
            sector_id = COALESCE($2, sector_id),
            note = COALESCE($3, note)
      WHERE id = $1 AND status = 'armed'`,
    [id, opts.sectorId ?? null, opts.note ?? null],
  );
}
