import { Pool, PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  PurchaseDef,
  PurchaseKind,
  PurchaseMerchant,
  PurchaseSlots,
  PurchaseView,
} from '../types/purchase';
import { Sector } from '../types/sector';
import { getActiveSeasonId } from './season.service';
import { experienceExpr } from './score-sql';

/**
 * Мастер и торговец. Захват их сектора чеканит жетон покупки
 * (`team_purchase_tokens`), а этот сервис превращает жетон в игровой эффект —
 * ровно как `diversion.service` делает это с жетоном диверсанта: одна покупка —
 * один жетон.
 *
 * Мгновенные товары меняют состояние сразу, остальные ложатся команде
 * имплантом («заряжены») и ждут её действия: раздвоение — второй заявки, батут —
 * прыжка мимо границы, подушка — сброса, труба — проверки, ЩИТ — чужой
 * диверсии, высокий старт — особого события. Снимают их те же места, что и
 * диверсии: `takeArmed` + `consume` внутри транзакции действия.
 *
 * Имплантов у команды не больше, чем слотов: базовые `BASE_IMPLANT_SLOTS` плюс
 * по одному за каждую купленную «дополнительную руку».
 */

/** Слоты под заряженные импланты без «дополнительной руки». */
export const BASE_IMPLANT_SLOTS = 2;

/** Потолок укрепления — тот же, что в submission.service. */
const MAX_FORTIFICATION = 3;

/** Влияние, которое «LEVEL UP» доплачивает бонусом эры (до множителя наград). */
const ERA_INFLUENCE_BONUS = 5;

export const PURCHASES: ReadonlyArray<PurchaseDef> = [
  /* ── Мастер: товары, меняющие механику ─────────────────────────────────── */
  {
    kind: 'split_capture',
    merchant: 'master',
    title: 'Раздвоение',
    description:
      'Позволяет начать захват сразу двух секторов: пока раздвоение заряжено, команда ведёт вторую заявку параллельно первой.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: true,
  },
  {
    kind: 'kip',
    merchant: 'master',
    title: 'К.И.П.',
    description:
      'Копируй, инициализируй, побеждай: следующий сектор выдаст задание, которое команда уже сдавала — то самое, с последнего одобренного действия.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: true,
  },
  {
    kind: 'chip',
    merchant: 'master',
    title: 'Чип',
    description:
      'Копирует один имплант у другой команды. Оригинал у соперника остаётся — чип делает копию, а не отбирает.',
    timing: 'instant',
    needs_target: true,
    needs_sector: false,
    charges: 1,
    takes_slot: false,
  },
  {
    kind: 'shield',
    merchant: 'master',
    title: 'ЩИТ',
    description:
      'Защищает от одной диверсии: следующая диверсия по команде сгорает вместе с жетоном диверсанта, не сработав.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: true,
  },
  {
    kind: 'high_start',
    merchant: 'master',
    title: 'Высокий старт',
    description:
      'Следующее особое событие команда начинает с преимуществом: итоговое место поднимается на одну ступень. Используется один раз.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: true,
  },
  {
    kind: 'level_up',
    merchant: 'master',
    title: 'LEVEL UP',
    description:
      'Повышение уровня: опыт добирается ровно до следующего уровня, плюс бонус эры влиянием.',
    timing: 'instant',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: false,
  },

  /* ── Торговец: товары, меняющие ход игры ───────────────────────────────── */
  {
    kind: 'trampoline',
    merchant: 'trader',
    title: 'Батут',
    description:
      'Два раза перепрыгнуть сектор: действие можно начать на секторе, не граничащем с территорией команды (досягаемость от якоря всё равно считается).',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 2,
    takes_slot: true,
  },
  {
    kind: 'spyglass',
    merchant: 'trader',
    title: 'Подзорная труба',
    description:
      'Три проверки сверх бюджета интеллекта: когда проверки кончились, следующая уходит с трубы.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 3,
    takes_slot: true,
  },
  {
    kind: 'airbag',
    merchant: 'trader',
    title: 'Подушка безопасности',
    description:
      'Следующий сброс сектора проходит без штрафа влиянием и опытом. Стрик всё равно сбивается.',
    timing: 'armed',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: true,
  },
  {
    kind: 'bricks',
    merchant: 'trader',
    title: 'Кирпичи',
    description:
      'Бесплатно укрепить один свой сектор: уровень поднимается сразу, без задания, с обычной наградой за укрепление.',
    timing: 'instant',
    needs_target: false,
    needs_sector: true,
    charges: 1,
    takes_slot: false,
  },
  {
    kind: 'extra_hand',
    merchant: 'trader',
    title: 'Дополнительная рука',
    description: `Плюс слот под один имплант: базовых слотов ${BASE_IMPLANT_SLOTS}, каждая рука добавляет ещё один.`,
    timing: 'instant',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: false,
  },
  {
    kind: 'refit',
    merchant: 'trader',
    title: 'Переборка',
    description:
      'Поменять расстановку характеристик: все вложенные очки возвращаются команде и распределяются заново.',
    timing: 'instant',
    needs_target: false,
    needs_sector: false,
    charges: 1,
    takes_slot: false,
  },
];

const BY_KIND = new Map(PURCHASES.map((p) => [p.kind, p]));

export function getDef(kind: PurchaseKind): PurchaseDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new AppError(400, 'Неизвестный товар');
  return def;
}

function assertKind(value: unknown): PurchaseKind {
  if (typeof value !== 'string' || !BY_KIND.has(value as PurchaseKind)) {
    throw new AppError(400, 'Неизвестный товар');
  }
  return value as PurchaseKind;
}

const VIEW_SELECT = `
  SELECT p.id, p.kind, p.merchant, p.status, p.charges_left, p.note,
         p.created_at, p.resolved_at,
         p.team_id, t.name AS team_name,
         p.target_team_id, tt.name AS target_team_name,
         p.sector_id, s.number AS sector_number, dl.slug AS sector_difficulty_slug
    FROM team_purchases p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN teams tt ON tt.id = p.target_team_id
    LEFT JOIN sectors s ON s.id = p.sector_id
    LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
`;

type ViewRow = Omit<PurchaseView, 'title'>;

function toView(row: ViewRow): PurchaseView {
  return { ...row, title: getDef(row.kind).title };
}

type Db = Pool | PoolClient;

async function getView(db: Db, id: string): Promise<PurchaseView> {
  const res = await db.query<ViewRow>(`${VIEW_SELECT} WHERE p.id = $1`, [id]);
  if (res.rows.length === 0) throw new AppError(404, 'Покупка не найдена');
  return toView(res.rows[0]);
}

export interface PurchasesResponse {
  /** Заряженные импланты команд — что у кого висит. */
  armed: PurchaseView[];
  /** Сработавшие / снятые — журнал председателя. */
  history: PurchaseView[];
  /** Занятые и всего слотов по каждой команде. */
  slots: PurchaseSlots[];
}

export async function list(limit = 30): Promise<PurchasesResponse> {
  const seasonId = await getActiveSeasonId();
  const [armed, history, slots] = await Promise.all([
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE p.season_id = $1 AND p.status = 'armed'
        ORDER BY p.created_at ASC`,
      [seasonId],
    ),
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE p.season_id = $1 AND p.status <> 'armed'
        ORDER BY COALESCE(p.resolved_at, p.created_at) DESC
        LIMIT $2`,
      [seasonId, limit],
    ),
    pool.query<PurchaseSlots>(
      `SELECT t.id AS team_id,
              COUNT(*) FILTER (
                WHERE p.status = 'armed' AND p.kind <> 'extra_hand'
              )::int AS used,
              ($2::int + COUNT(*) FILTER (
                WHERE p.kind = 'extra_hand' AND p.status = 'applied'
              ))::int AS total
         FROM teams t
         LEFT JOIN team_purchases p ON p.team_id = t.id AND p.season_id = $1
        GROUP BY t.id`,
      [seasonId, BASE_IMPLANT_SLOTS],
    ),
  ]);
  return {
    armed: armed.rows.map(toView),
    history: history.rows.map(toView),
    slots: slots.rows,
  };
}

/** Сколько неистраченных жетонов этой лавки у команды. */
export async function countTokens(
  teamId: string,
  merchant: PurchaseMerchant,
): Promise<number> {
  const res = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM team_purchase_tokens
      WHERE team_id = $1 AND merchant_type = $2 AND spent_at IS NULL`,
    [teamId, merchant],
  );
  return res.rows[0]?.count ?? 0;
}

/**
 * Списывает самый старый неистраченный жетон нужной лавки. Блокировка строки не
 * даёт двум параллельным покупкам уехать на одном жетоне.
 */
async function spendToken(
  client: PoolClient,
  teamId: string,
  merchant: PurchaseMerchant,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `UPDATE team_purchase_tokens
        SET spent_at = NOW()
      WHERE id = (
        SELECT id FROM team_purchase_tokens
         WHERE team_id = $1 AND merchant_type = $2 AND spent_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
    [teamId, merchant],
  );
  if (res.rows.length === 0) {
    throw new AppError(
      400,
      merchant === 'master'
        ? 'У команды нет неистраченных жетонов мастера'
        : 'У команды нет неистраченных жетонов торговца',
    );
  }
  return res.rows[0].id;
}

/** Занятые/всего слотов команды внутри транзакции. */
async function getSlots(
  client: PoolClient,
  teamId: string,
): Promise<{ used: number; total: number }> {
  const res = await client.query<{ used: number; hands: number }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'armed' AND kind <> 'extra_hand')::int AS used,
            COUNT(*) FILTER (WHERE kind = 'extra_hand' AND status = 'applied')::int AS hands
       FROM team_purchases
      WHERE team_id = $1`,
    [teamId],
  );
  const row = res.rows[0] ?? { used: 0, hands: 0 };
  return { used: row.used, total: BASE_IMPLANT_SLOTS + row.hands };
}

async function assertFreeSlot(client: PoolClient, teamId: string): Promise<void> {
  const { used, total } = await getSlots(client, teamId);
  if (used >= total) {
    throw new AppError(
      409,
      `Слоты имплантов заняты (${used} из ${total}) — потратьте имплант или купите «дополнительную руку»`,
    );
  }
}

/** Опыт, которого команде не хватает до следующего уровня. */
async function experienceToNextLevel(
  client: PoolClient,
  teamId: string,
): Promise<number> {
  const expRes = await client.query<{ experience: number }>(
    `SELECT ${experienceExpr('$1')} AS experience`,
    [teamId],
  );
  const experience = expRes.rows[0]?.experience ?? 0;

  const settingsRes = await client.query<{ key: string; value: string }>(
    `SELECT key, value FROM game_settings
      WHERE key IN ('base_exp_threshold', 'exp_step')`,
  );
  let baseExp = 50;
  let expStep = 10;
  for (const row of settingsRes.rows) {
    if (row.key === 'base_exp_threshold') baseExp = Number(row.value);
    if (row.key === 'exp_step') expStep = Number(row.value);
  }

  let remaining = experience;
  let threshold = baseExp;
  while (remaining >= threshold) {
    remaining -= threshold;
    threshold += expStep;
  }
  return threshold - remaining;
}

async function rewardMultiplier(client: PoolClient): Promise<number> {
  const res = await client.query<{ value: string }>(
    `SELECT value FROM game_settings WHERE key = 'reward_multiplier'`,
  );
  const value = Number(res.rows[0]?.value ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function bumpAdjustments(
  client: PoolClient,
  teamId: string,
  deltas: { influence?: number; experience?: number; upgradePoints?: number },
): Promise<void> {
  await client.query(
    `INSERT INTO team_adjustments
       (team_id, influence_delta, experience_delta, upgrade_points_delta, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (team_id) DO UPDATE SET
       influence_delta = team_adjustments.influence_delta + EXCLUDED.influence_delta,
       experience_delta = team_adjustments.experience_delta + EXCLUDED.experience_delta,
       upgrade_points_delta = team_adjustments.upgrade_points_delta + EXCLUDED.upgrade_points_delta,
       updated_at = NOW()`,
    [teamId, deltas.influence ?? 0, deltas.experience ?? 0, deltas.upgradePoints ?? 0],
  );
}

export interface BuyParams {
  teamId: string;
  kind: unknown;
  targetTeamId?: string | null;
  sectorId?: string | null;
}

interface InstantResult {
  note: string;
  targetTeamId: string | null;
  sectorId: string | null;
  /** Заряженный имплант, который породил мгновенный товар («чип»). */
  spawned?: { kind: PurchaseKind; chargesLeft: number } | null;
}

/** Мгновенный эффект. Возвращает текст для журнала и итоговую цель/сектор. */
async function applyInstant(
  client: PoolClient,
  kind: PurchaseKind,
  teamId: string,
  targetTeamId: string | null,
  sectorId: string | null,
): Promise<InstantResult> {
  switch (kind) {
    case 'chip': {
      // Копия, а не кража: у соперника имплант остаётся. Берём самый старый —
      // так выбор предсказуем и не зависит от порядка строк.
      const donor = await client.query<{ kind: PurchaseKind; charges_left: number }>(
        `SELECT kind, charges_left FROM team_purchases
          WHERE team_id = $1 AND status = 'armed'
          ORDER BY created_at ASC
          LIMIT 1`,
        [targetTeamId],
      );
      if (donor.rows.length === 0) {
        throw new AppError(400, 'У соперника нет заряженных имплантов — копировать нечего');
      }
      const copied = donor.rows[0];
      // Копия займёт слот покупателя, поэтому слот нужен свободный.
      await assertFreeSlot(client, teamId);
      return {
        note: `Скопирован имплант «${getDef(copied.kind).title}»`,
        targetTeamId,
        sectorId: null,
        spawned: { kind: copied.kind, chargesLeft: copied.charges_left },
      };
    }
    case 'level_up': {
      const gap = await experienceToNextLevel(client, teamId);
      const bonus = Math.round(ERA_INFLUENCE_BONUS * (await rewardMultiplier(client)));
      await bumpAdjustments(client, teamId, { experience: gap, influence: bonus });
      return {
        note: `Уровень +1 (опыт +${gap}), бонус эры: влияние +${bonus}`,
        targetTeamId: null,
        sectorId: null,
      };
    }
    case 'bricks': {
      const secRes = await client.query<Sector>(
        'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
        [sectorId],
      );
      if (secRes.rows.length === 0) throw new AppError(404, 'Сектор не найден');
      const sector = secRes.rows[0];
      if (sector.captured_by_team_id !== teamId) {
        throw new AppError(400, 'Укрепить можно только свой сектор');
      }
      if (sector.is_home_base) {
        throw new AppError(400, 'Домашний сектор не укрепляется');
      }
      if (sector.fortification_level >= MAX_FORTIFICATION) {
        throw new AppError(400, 'Максимальный уровень укрепления уже достигнут');
      }
      const next = sector.fortification_level + 1;
      await client.query('UPDATE sectors SET fortification_level = $1 WHERE id = $2', [
        next,
        sector.id,
      ]);
      // Награда за укрепление — та же, что за выполненное задание: половина
      // влияния и опыта сектора (score-sql считает её по этому журналу).
      await client.query(
        'INSERT INTO sector_fortification_awards (sector_id, team_id) VALUES ($1, $2)',
        [sector.id, teamId],
      );
      return {
        note: `Укрепление ${sector.fortification_level} → ${next}`,
        targetTeamId: null,
        sectorId: sector.id,
      };
    }
    case 'extra_hand': {
      const { total } = await getSlots(client, teamId);
      return {
        note: `Слотов имплантов: ${total} → ${total + 1}`,
        targetTeamId: null,
        sectorId: null,
      };
    }
    case 'refit': {
      const removed = await client.query(
        'DELETE FROM team_stat_upgrades WHERE team_id = $1',
        [teamId],
      );
      return {
        note: `Возвращено очков апгрейда: ${removed.rowCount ?? 0}`,
        targetTeamId: null,
        sectorId: null,
      };
    }
    default:
      throw new AppError(400, 'Этот товар не мгновенный');
  }
}

/**
 * Купить товар за жетон команды. Одна транзакция: списание жетона и эффект едут
 * вместе, откат снимает обоих.
 */
export async function buy(params: BuyParams): Promise<PurchaseView> {
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
  if (targetTeamId && targetTeamId === params.teamId) {
    throw new AppError(400, 'Имплант копируется у соперника, а не у себя');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);

    const teamsRes = await client.query<{ id: string }>(
      'SELECT id FROM teams WHERE id = ANY($1::uuid[])',
      [[params.teamId, ...(targetTeamId ? [targetTeamId] : [])]],
    );
    if (teamsRes.rows.length !== (targetTeamId ? 2 : 1)) {
      throw new AppError(404, 'Команда не найдена');
    }

    if (def.timing === 'armed') {
      if (def.takes_slot) await assertFreeSlot(client, params.teamId);
      // Два одинаковых импланта одновременно бессмысленны: сработает первый.
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM team_purchases
          WHERE team_id = $1 AND kind = $2 AND status = 'armed'`,
        [params.teamId, kind],
      );
      if (dup.rows.length > 0) {
        throw new AppError(409, 'Такой имплант у команды уже заряжен');
      }
    }

    const tokenId = await spendToken(client, params.teamId, def.merchant);

    let note: string | null = null;
    let finalTarget = targetTeamId;
    let finalSector = sectorId;
    let spawned: InstantResult['spawned'] = null;

    if (def.timing === 'instant') {
      const applied = await applyInstant(
        client,
        kind,
        params.teamId,
        targetTeamId,
        sectorId,
      );
      note = applied.note;
      finalTarget = applied.targetTeamId;
      finalSector = applied.sectorId;
      spawned = applied.spawned ?? null;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO team_purchases
         (season_id, merchant, kind, team_id, target_team_id, sector_id, token_id,
          status, charges_left, note, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        seasonId,
        def.merchant,
        kind,
        params.teamId,
        finalTarget,
        finalSector,
        tokenId,
        def.timing === 'instant' ? 'applied' : 'armed',
        def.timing === 'instant' ? 0 : def.charges,
        note,
        def.timing === 'instant' ? new Date() : null,
      ],
    );

    if (spawned) {
      // Копия чипа живёт отдельной записью — жетон у неё уже потрачен на чип.
      const copyDef = getDef(spawned.kind);
      await client.query(
        `INSERT INTO team_purchases
           (season_id, merchant, kind, team_id, status, charges_left, note)
         VALUES ($1, $2, $3, $4, 'armed', $5, $6)`,
        [
          seasonId,
          copyDef.merchant,
          spawned.kind,
          params.teamId,
          spawned.chargesLeft,
          'Копия чипа',
        ],
      );
    }

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

/** Снять заряженный имплант, не дожидаясь срабатывания. Жетон не возвращается. */
export async function cancel(id: string): Promise<PurchaseView> {
  const res = await pool.query(
    `UPDATE team_purchases
        SET status = 'cancelled', charges_left = 0, resolved_at = NOW(),
            note = COALESCE(note, 'Снят председателем')
      WHERE id = $1 AND status = 'armed'`,
    [id],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Заряженный имплант не найден');
  }
  return getView(pool, id);
}

/* ── Движок: снятие заряженных товаров ────────────────────────────────────── */

/**
 * Заряженный имплант такого вида у команды, если есть. Строка блокируется до
 * конца транзакции вызывающего — два параллельных действия одной команды не
 * снимут один имплант дважды.
 */
export async function takeArmed(
  client: PoolClient,
  teamId: string,
  kind: PurchaseKind,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM team_purchases
      WHERE team_id = $1 AND kind = $2 AND status = 'armed' AND charges_left > 0
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [teamId, kind],
  );
  return res.rows[0]?.id ?? null;
}

/** Сколько срабатываний импланта такого вида осталось у команды. */
export async function chargesLeft(
  client: PoolClient,
  teamId: string,
  kind: PurchaseKind,
): Promise<number> {
  const res = await client.query<{ total: number }>(
    `SELECT COALESCE(SUM(charges_left), 0)::int AS total
       FROM team_purchases
      WHERE team_id = $1 AND kind = $2 AND status = 'armed'`,
    [teamId, kind],
  );
  return res.rows[0]?.total ?? 0;
}

/**
 * Списать одно срабатывание импланта. Батут и труба живут дальше, пока заряды
 * не кончатся; на нуле имплант закрывается и освобождает слот.
 */
export async function consume(
  client: PoolClient,
  id: string,
  opts: { sectorId?: string | null; note?: string } = {},
): Promise<void> {
  await client.query(
    `UPDATE team_purchases
        SET charges_left = GREATEST(charges_left - 1, 0),
            status = CASE WHEN charges_left - 1 <= 0 THEN 'consumed' ELSE 'armed' END,
            resolved_at = CASE WHEN charges_left - 1 <= 0 THEN NOW() ELSE resolved_at END,
            sector_id = COALESCE($2, sector_id),
            note = COALESCE($3, note)
      WHERE id = $1 AND status = 'armed'`,
    [id, opts.sectorId ?? null, opts.note ?? null],
  );
}
