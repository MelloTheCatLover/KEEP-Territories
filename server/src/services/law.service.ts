import { Pool, PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  LawEffectView,
  WheelPrizeDef,
  WheelPrizeKind,
} from '../types/law';
import { Sector } from '../types/sector';
import { getActiveSeasonId } from './season.service';
import {
  bumpAdjustments,
  experienceToNextLevel,
  rewardMultiplier,
} from './purchase.service';

/**
 * Механические законы съезда. Председатель включает закон руками, а движок
 * отыгрывает его сам — так же, как диверсии (`diversion.service`) и покупки
 * (`purchase.service`) отыгрывают жетоны: одно применение — одна запись.
 *
 * Пока закон один — «Колесо фортуны»: председатель даёт колесо команде, оно
 * крутится и выдаёт плюшку. Крутит колесо сервер (`spinWheel`), клиент лишь
 * доигрывает анимацию до выпавшего сектора — иначе колесо можно перекрутить
 * перезагрузкой страницы.
 *
 * Плюшки мелкие, кроме одного «джекпота»: набор подобран так, чтобы колесо
 * было приятным, но не решало исход смены. Влияние и опыт закон не считает
 * сам — плюс идёт через `team_adjustments`, жетоны через
 * `team_purchase_tokens`, укрепление через `sectors.fortification_level`,
 * поэтому формулы `score-sql.ts` не меняются.
 */

/** «Мелочь в кармане». */
const PRIZE_INFLUENCE = 2;
/** «Разминка». */
const PRIZE_EXPERIENCE = 50;
/** Влияние джекпота — до множителя наград. */
const JACKPOT_INFLUENCE = 12;
/** Потолок укрепления — тот же, что в submission.service. */
const MAX_FORTIFICATION = 3;

export const WHEEL_PRIZES: ReadonlyArray<WheelPrizeDef> = [
  {
    kind: 'influence',
    title: 'Мелочь в кармане',
    description: `Плюс ${PRIZE_INFLUENCE} влияния команде — сразу, без задания.`,
    timing: 'instant',
    weight: 18,
    needs_sector: false,
  },
  {
    kind: 'experience',
    title: 'Разминка',
    description: `Плюс ${PRIZE_EXPERIENCE} опыта команде — сразу, без задания.`,
    timing: 'instant',
    weight: 18,
    needs_sector: false,
  },
  {
    kind: 'upgrade_point',
    title: 'Тренировка',
    description:
      'Плюс одно очко апгрейда: команда сама решает, в какую характеристику его вложить.',
    timing: 'instant',
    weight: 14,
    needs_sector: false,
  },
  {
    kind: 'trader_token',
    title: 'Купон торговца',
    description:
      'Жетон торговца без захвата его сектора — один товар из лавки торговца.',
    timing: 'instant',
    weight: 12,
    needs_sector: false,
  },
  {
    kind: 'queue_priority',
    title: 'Без очереди',
    description:
      'Следующая заявка команды встаёт первой в очереди сдачи — председатель проверяет её раньше остальных.',
    timing: 'armed',
    weight: 12,
    needs_sector: false,
  },
  {
    kind: 'saboteur_token',
    title: 'Тёмный сговор',
    description: 'Жетон диверсанта без захвата его сектора — одна диверсия по сопернику.',
    timing: 'instant',
    weight: 10,
    needs_sector: false,
  },
  {
    kind: 'fortification',
    title: 'Мешок цемента',
    description:
      'Бесплатное укрепление одного своего сектора: уровень поднимается без задания, с обычной наградой за укрепление. Сектор выбирается при применении.',
    timing: 'armed',
    weight: 10,
    needs_sector: true,
  },
  {
    kind: 'jackpot',
    title: 'ДЖЕКПОТ',
    description: `Уровень вверх (опыт добирается до следующего), плюс ${JACKPOT_INFLUENCE} влияния и жетон мастера.`,
    timing: 'instant',
    weight: 6,
    needs_sector: false,
  },
];

const BY_KIND = new Map(WHEEL_PRIZES.map((p) => [p.kind, p]));

export function getPrize(kind: WheelPrizeKind): WheelPrizeDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new AppError(400, 'Неизвестная плюшка колеса');
  return def;
}

/** Взвешенный бросок: шанс сектора пропорционален его весу. */
function rollPrize(): WheelPrizeDef {
  const total = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of WHEEL_PRIZES) {
    roll -= prize.weight;
    if (roll < 0) return prize;
  }
  return WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
}

const VIEW_SELECT = `
  SELECT e.id, e.law, e.kind, e.status, e.note, e.created_at, e.resolved_at,
         e.team_id, t.name AS team_name, t.color AS team_color,
         e.sector_id, s.number AS sector_number, dl.slug AS sector_difficulty_slug
    FROM team_law_effects e
    JOIN teams t ON t.id = e.team_id
    LEFT JOIN sectors s ON s.id = e.sector_id
    LEFT JOIN difficulty_levels dl ON dl.id = s.difficulty_id
`;

type ViewRow = Omit<LawEffectView, 'title'>;

function toView(row: ViewRow): LawEffectView {
  return { ...row, title: getPrize(row.kind).title };
}

type Db = Pool | PoolClient;

async function getView(db: Db, id: string): Promise<LawEffectView> {
  const res = await db.query<ViewRow>(`${VIEW_SELECT} WHERE e.id = $1`, [id]);
  if (res.rows.length === 0) throw new AppError(404, 'Применение закона не найдено');
  return toView(res.rows[0]);
}

export interface LawEffectsResponse {
  /** Плюшки, которые ещё ждут своего момента. */
  armed: LawEffectView[];
  /** Сработавшие / снятые — журнал председателя. */
  history: LawEffectView[];
}

export async function list(limit = 30): Promise<LawEffectsResponse> {
  const seasonId = await getActiveSeasonId();
  const [armed, history] = await Promise.all([
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE e.season_id = $1 AND e.status = 'armed'
        ORDER BY e.created_at ASC`,
      [seasonId],
    ),
    pool.query<ViewRow>(
      `${VIEW_SELECT} WHERE e.season_id = $1 AND e.status <> 'armed'
        ORDER BY COALESCE(e.resolved_at, e.created_at) DESC
        LIMIT $2`,
      [seasonId, limit],
    ),
  ]);
  return { armed: armed.rows.map(toView), history: history.rows.map(toView) };
}

/** Лента для участников: что кому выпало на колесе. */
export async function listFeed(limit = 20): Promise<LawEffectView[]> {
  const seasonId = await getActiveSeasonId();
  const res = await pool.query<ViewRow>(
    `${VIEW_SELECT}
      WHERE e.season_id = $1 AND e.law = 'wheel_of_fortune' AND e.status <> 'cancelled'
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [seasonId, limit],
  );
  return res.rows.map(toView);
}

/* ── Эффекты ──────────────────────────────────────────────────────────────── */

interface InstantResult {
  note: string;
  sectorId: string | null;
}

async function mintToken(
  client: PoolClient,
  teamId: string,
  merchant: 'master' | 'trader' | 'saboteur',
): Promise<void> {
  // Плавающий жетон, не привязанный к сектору — как «очко покупки» диверсанта.
  await client.query(
    `INSERT INTO team_purchase_tokens (team_id, sector_id, merchant_type)
     VALUES ($1, NULL, $2)`,
    [teamId, merchant],
  );
}

/** Мгновенная плюшка. Возвращает текст для журнала. */
async function applyInstant(
  client: PoolClient,
  kind: WheelPrizeKind,
  teamId: string,
): Promise<InstantResult> {
  switch (kind) {
    case 'influence': {
      const amount = Math.round(PRIZE_INFLUENCE * (await rewardMultiplier(client)));
      await bumpAdjustments(client, teamId, { influence: amount });
      return { note: `Влияние +${amount}`, sectorId: null };
    }
    case 'experience': {
      const amount = Math.round(PRIZE_EXPERIENCE * (await rewardMultiplier(client)));
      await bumpAdjustments(client, teamId, { experience: amount });
      return { note: `Опыт +${amount}`, sectorId: null };
    }
    case 'upgrade_point': {
      await bumpAdjustments(client, teamId, { upgradePoints: 1 });
      return { note: 'Очко апгрейда +1', sectorId: null };
    }
    case 'trader_token': {
      await mintToken(client, teamId, 'trader');
      return { note: 'Выдан жетон торговца', sectorId: null };
    }
    case 'saboteur_token': {
      await mintToken(client, teamId, 'saboteur');
      return { note: 'Выдан жетон диверсанта', sectorId: null };
    }
    case 'jackpot': {
      const gap = await experienceToNextLevel(client, teamId);
      const influence = Math.round(JACKPOT_INFLUENCE * (await rewardMultiplier(client)));
      await bumpAdjustments(client, teamId, { experience: gap, influence });
      await mintToken(client, teamId, 'master');
      return {
        note: `Уровень +1 (опыт +${gap}), влияние +${influence}, жетон мастера`,
        sectorId: null,
      };
    }
    default:
      throw new AppError(400, 'Эта плюшка не мгновенная');
  }
}

/**
 * Дать команде колесо и крутануть его. Одна транзакция: бросок и эффект едут
 * вместе, откат снимает обоих.
 */
export async function spinWheel(rawTeamId: unknown): Promise<LawEffectView> {
  const teamId = typeof rawTeamId === 'string' ? rawTeamId.trim() : '';
  if (teamId.length === 0) {
    throw new AppError(400, 'Не указана команда');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonId = await getActiveSeasonId(client);
    const teamRes = await client.query<{ id: string }>(
      'SELECT id FROM teams WHERE id = $1 AND season_id = $2',
      [teamId, seasonId],
    );
    if (teamRes.rows.length === 0) {
      throw new AppError(404, 'Команда не найдена');
    }

    const prize = rollPrize();

    // Дубль заряженной плюшки бессмысленен: сработает первая, вторая зависнет.
    // Перекручиваем на месте — команда получает хоть что-то, а не пустой ход.
    let resolved = prize;
    if (prize.timing === 'armed') {
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM team_law_effects
          WHERE team_id = $1 AND kind = $2 AND status = 'armed'`,
        [teamId, prize.kind],
      );
      if (dup.rows.length > 0) {
        resolved = getPrize('experience');
      }
    }

    const note =
      resolved.timing === 'instant'
        ? (await applyInstant(client, resolved.kind, teamId)).note
        : null;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO team_law_effects
         (season_id, law, kind, team_id, status, note, resolved_at)
       VALUES ($1, 'wheel_of_fortune', $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        seasonId,
        resolved.kind,
        teamId,
        resolved.timing === 'instant' ? 'applied' : 'armed',
        note,
        resolved.timing === 'instant' ? new Date() : null,
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

/**
 * Применить заряженную плюшку, которой нужен выбор председателя, — сейчас это
 * только «мешок цемента» с сектором. «Без очереди» снимает движок сдачи сам.
 */
export async function applyArmed(
  id: string,
  rawSectorId: unknown,
): Promise<LawEffectView> {
  const sectorId = typeof rawSectorId === 'string' ? rawSectorId.trim() : '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query<{ kind: WheelPrizeKind; team_id: string }>(
      `SELECT kind, team_id FROM team_law_effects
        WHERE id = $1 AND status = 'armed'
        FOR UPDATE`,
      [id],
    );
    if (res.rows.length === 0) {
      throw new AppError(404, 'Заряженная плюшка не найдена');
    }
    const { kind, team_id: teamId } = res.rows[0];
    const def = getPrize(kind);
    if (!def.needs_sector) {
      throw new AppError(400, 'Эта плюшка срабатывает сама — применять её руками не нужно');
    }
    if (sectorId.length === 0) {
      throw new AppError(400, 'Нужно выбрать сектор');
    }

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
    // Награда за укрепление — та же, что за выполненное задание (score-sql
    // считает её по этому журналу).
    await client.query(
      'INSERT INTO sector_fortification_awards (sector_id, team_id) VALUES ($1, $2)',
      [sector.id, teamId],
    );

    await client.query(
      `UPDATE team_law_effects
          SET status = 'consumed', sector_id = $2, note = $3, resolved_at = NOW()
        WHERE id = $1`,
      [id, sector.id, `Укрепление ${sector.fortification_level} → ${next}`],
    );

    const view = await getView(client, id);
    await client.query('COMMIT');
    return view;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Снять заряженную плюшку, не дожидаясь срабатывания. */
export async function cancel(id: string): Promise<LawEffectView> {
  const res = await pool.query(
    `UPDATE team_law_effects
        SET status = 'cancelled', resolved_at = NOW(),
            note = COALESCE(note, 'Снята председателем')
      WHERE id = $1 AND status = 'armed'`,
    [id],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Заряженная плюшка не найдена');
  }
  return getView(pool, id);
}

/* ── Движок: снятие заряженных плюшек ─────────────────────────────────────── */

/**
 * Заряженная плюшка такого вида у команды, если есть. Строка блокируется до
 * конца транзакции вызывающего — два параллельных действия одной команды не
 * снимут её дважды.
 */
export async function takeArmed(
  client: PoolClient,
  teamId: string,
  kind: WheelPrizeKind,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM team_law_effects
      WHERE team_id = $1 AND kind = $2 AND status = 'armed'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [teamId, kind],
  );
  return res.rows[0]?.id ?? null;
}

/** Закрыть сработавшую плюшку. */
export async function consume(
  client: PoolClient,
  id: string,
  opts: { sectorId?: string | null; note?: string } = {},
): Promise<void> {
  await client.query(
    `UPDATE team_law_effects
        SET status = 'consumed', resolved_at = NOW(),
            sector_id = COALESCE($2, sector_id),
            note = COALESCE($3, note)
      WHERE id = $1 AND status = 'armed'`,
    [id, opts.sectorId ?? null, opts.note ?? null],
  );
}
