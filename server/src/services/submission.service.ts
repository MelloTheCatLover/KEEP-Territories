import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  TaskSubmission,
  TaskSubmissionWithDetails,
  SubmissionStatus,
  TaskBrief,
  StartActionResponse,
} from '../types/task-submission';
import { Sector, SectorActionType } from '../types/sector';
import { StatName, MerchantType } from '../types/team-stats';
import { DiversionKind } from '../types/diversion';
import { PurchaseKind } from '../types/purchase';
import * as encounterService from './encounter.service';
import * as diversionService from './diversion.service';
import * as purchaseService from './purchase.service';
import * as lawService from './law.service';
import * as seasonService from './season.service';
import { experienceExpr } from './score-sql';
import {
  penetrationFromStrength,
  movementFromEndurance,
  checksFromIntelligence,
  rerollsFromLuck,
} from './stat-thresholds';

const MAX_FORTIFICATION = 3;

async function getTeamStat(
  client: PoolClient,
  teamId: string,
  stat: StatName,
): Promise<number> {
  const res = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM team_stat_upgrades
      WHERE team_id = $1 AND stat_name = $2`,
    [teamId, stat],
  );
  return res.rows[0]?.count ?? 0;
}

/** Axial hex distance between two sectors. */
function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** The six axial neighbour offsets (mirror of client hex-utils). */
const AXIAL_NEIGHBORS: ReadonlyArray<{ q: number; r: number }> = [
  { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
];

/**
 * Whether the sector borders at least one sector the team already holds.
 * Покрашенные законом «Граффити» клетки считаются своими: краска ничего не
 * приносит, но по ней команда ходит — от неё можно занимать соседние секторы.
 */
async function bordersOwnTerritory(
  client: PoolClient,
  sector: Sector,
  teamId: string,
): Promise<boolean> {
  const captured = await client.query<{ q: number; r: number }>(
    'SELECT q, r FROM sectors WHERE captured_by_team_id = $1 OR graffiti_team_id = $1',
    [teamId],
  );
  const keys = new Set(captured.rows.map((c) => `${c.q},${c.r}`));
  return AXIAL_NEIGHBORS.some((d) => keys.has(`${sector.q + d.q},${sector.r + d.r}`));
}

/**
 * The team's movement anchor: the sector it captured most recently (its home
 * base is its first capture, so a fresh team always has one). Reachability is
 * measured from here, not from the whole border — that is what stops a team
 * with a huge territory from "teleporting" across it. Endurance widens the
 * radius; without it the team must capture waypoint sectors ("перевалы") to
 * walk the anchor toward a distant target.
 */
async function getTeamAnchor(
  client: PoolClient,
  teamId: string,
): Promise<{ q: number; r: number } | null> {
  const res = await client.query<{ q: number; r: number }>(
    `SELECT s.q, s.r
       FROM sector_captures sc
       JOIN sectors s ON s.id = sc.sector_id
      WHERE sc.team_id = $1
      ORDER BY sc.captured_at DESC
      LIMIT 1`,
    [teamId],
  );
  return res.rows[0] ?? null;
}

/** The team's home base — the fallback anchor after a «hard_reset» diversion. */
async function getTeamHomeBase(
  client: PoolClient,
  teamId: string,
): Promise<{ q: number; r: number } | null> {
  const res = await client.query<{ q: number; r: number }>(
    'SELECT q, r FROM sectors WHERE home_team_id = $1 AND is_home_base = true LIMIT 1',
    [teamId],
  );
  return res.rows[0] ?? null;
}

/**
 * Whether the sector lies within the team's endurance reach of its anchor.
 * `fromHome` — диверсия «команда отправляется на начальную позицию»: отсчёт
 * идёт от домашней базы, а не от последнего захвата. `canJump` — товар
 * торговца «батут»: правило соседства пропускается, досягаемость — нет.
 * Возвращает `true`, если прыжок действительно понадобился, — заряд батута
 * тратится только тогда.
 */
async function assertWithinReach(
  client: PoolClient,
  sector: Sector,
  teamId: string,
  fromHome = false,
  canJump = false,
): Promise<boolean> {
  const anchor = fromHome
    ? (await getTeamHomeBase(client, teamId)) ?? (await getTeamAnchor(client, teamId))
    : await getTeamAnchor(client, teamId);
  if (!anchor) {
    throw new AppError(400, 'У команды нет захваченных секторов');
  }
  const endurance = await getTeamStat(client, teamId, 'endurance');
  // Movement points are steps: a sector d hexes from the anchor costs d points.
  const reach = movementFromEndurance(endurance);
  const dist = hexDistance(anchor.q, anchor.r, sector.q, sector.r);
  if (dist > reach) {
    throw new AppError(
      400,
      `Сектор вне досягаемости (расстояние ${dist}, очков передвижения ${reach}). ` +
        `Прокачайте выносливость или захватите промежуточные сектора.`,
    );
  }

  // Taking a new sector (not fortifying an owned one): it must border the team's
  // captured territory — expansion goes one step out from the frontier, never a
  // jump into empty space that merely sits within the anchor radius.
  if (sector.captured_by_team_id !== teamId) {
    if (!(await bordersOwnTerritory(client, sector, teamId))) {
      if (!canJump) {
        throw new AppError(
          400,
          'Сектор не граничит с вашей территорией — ходить можно только на сектора рядом с захваченными.',
        );
      }
      return true;
    }
  }
  return false;
}

/**
 * Validate and charge a teleport under the active "Телепорт" law. The target
 * must be the same difficulty as the team's anchor (its last-captured sector);
 * reach and the border rule are skipped. Costs a flat experience amount, booked
 * as a team_penalty (reason 'teleport') within the caller's transaction, so a
 * later rollback undoes the charge. Throws AppError on any failed precondition.
 */
async function assertTeleport(
  client: PoolClient,
  sector: Sector,
  teamId: string,
  actionType: SectorActionType,
): Promise<void> {
  if (actionType !== 'capture' && actionType !== 'recapture') {
    throw new AppError(400, 'Телепорт доступен только при захвате или перезахвате');
  }

  const lawRes = await client.query<{ value: string }>(
    `SELECT value FROM game_settings WHERE key = 'active_law'`,
  );
  if (lawRes.rows[0]?.value !== 'teleport') {
    throw new AppError(400, 'Закон «Телепорт» сейчас не действует');
  }

  // Anchor = the sector the team stands on (its most recent capture).
  const anchorRes = await client.query<{ difficulty_id: string }>(
    `SELECT s.difficulty_id
       FROM sector_captures sc
       JOIN sectors s ON s.id = sc.sector_id
      WHERE sc.team_id = $1
      ORDER BY sc.captured_at DESC
      LIMIT 1`,
    [teamId],
  );
  const anchorDifficulty = anchorRes.rows[0]?.difficulty_id;
  if (!anchorDifficulty) {
    throw new AppError(400, 'У команды нет захваченных секторов — телепорт невозможен');
  }
  if (sector.difficulty_id !== anchorDifficulty) {
    throw new AppError(
      400,
      'Телепорт возможен только на сектор той же сложности, что и ваш последний захват',
    );
  }

  // Affordability — canonical experience formula (score-sql).
  const expRes = await client.query<{ experience: number }>(
    `SELECT ${experienceExpr('$1')} AS experience`,
    [teamId],
  );
  const experience = expRes.rows[0].experience;
  if (experience < TELEPORT_COST) {
    throw new AppError(
      400,
      `Недостаточно опыта для телепорта: нужно ${TELEPORT_COST}, есть ${experience}`,
    );
  }

  await client.query(
    `INSERT INTO team_penalties (team_id, influence, experience, reason, sector_id)
     VALUES ($1, 0, $2, 'teleport', $3)`,
    [teamId, TELEPORT_COST, sector.id],
  );
}

const ACTION_TYPES: ReadonlyArray<SectorActionType> = [
  'capture',
  'fortify',
  'remove_fortification',
  'recapture',
];

function assertActionType(value: unknown): SectorActionType {
  if (typeof value !== 'string' || !ACTION_TYPES.includes(value as SectorActionType)) {
    throw new AppError(400, 'Invalid action_type');
  }
  return value as SectorActionType;
}

/**
 * Resolve which team an action is performed for.
 * Admins drive the field on behalf of a team via `actingTeamId` (no membership
 * required). Other callers fall back to their own team membership.
 */
async function resolveActingTeam(
  client: PoolClient,
  userId: string,
  actingTeamId?: string,
): Promise<string> {
  if (!actingTeamId) {
    return getUserTeamId(client, userId);
  }
  const userRes = await client.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (userRes.rows[0].role !== 'admin') {
    throw new AppError(403, 'Только председатель КТП может играть за команду');
  }
  const teamRes = await client.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1',
    [actingTeamId],
  );
  if (teamRes.rows.length === 0) {
    throw new AppError(404, 'Команда не найдена');
  }
  return actingTeamId;
}

async function getUserTeamId(client: PoolClient, userId: string): Promise<string> {
  const res = await client.query<{ team_id: string | null; team_role: string | null }>(
    'SELECT team_id, team_role FROM users WHERE id = $1',
    [userId],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  if (!res.rows[0].team_id) {
    throw new AppError(400, 'You are not in a team');
  }
  // Captains manage team stats, not the field — sector actions are off-limits.
  if (res.rows[0].team_role === 'captain') {
    throw new AppError(403, 'Капитан не может захватывать сектора');
  }
  return res.rows[0].team_id;
}

async function buildTaskPool(
  client: PoolClient,
  sector: Sector,
): Promise<TaskBrief[]> {
  const mapped = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM sector_tasks st
       JOIN tasks t ON t.id = st.task_id
      WHERE st.sector_id = $1`,
    [sector.id],
  );
  if (mapped.rows.length > 0) return mapped.rows;

  if (sector.task_id) {
    const direct = await client.query<TaskBrief>(
      'SELECT id, title, question FROM tasks WHERE id = $1',
      [sector.task_id],
    );
    if (direct.rows.length > 0) return direct.rows;
  }

  const fallback = await client.query<TaskBrief>(
    'SELECT id, title, question FROM tasks WHERE difficulty_id = $1',
    [sector.difficulty_id],
  );
  return fallback.rows;
}

/**
 * Пул сложных заданий — диверсия «следующий сектор выполняется как сложный».
 * Пустой пул означает, что заданий сложности ещё не завели: тогда действие
 * идёт по обычному пулу сектора, а не срывается.
 */
async function buildHardTaskPool(client: PoolClient): Promise<TaskBrief[]> {
  const res = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM tasks t
       JOIN difficulty_levels dl ON dl.id = t.difficulty_id
      WHERE dl.slug = 'hard'`,
  );
  return res.rows;
}

/**
 * Пул для товара мастера «К.И.П.»: последнее задание, которое команда уже сдала
 * и которое ей одобрили. Пустой пул (первое действие смены) означает, что копия
 * не удалась — сектор выдаст задание обычным порядком.
 */
async function buildKipTaskPool(client: PoolClient, teamId: string): Promise<TaskBrief[]> {
  const res = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM task_submissions sub
       JOIN tasks t ON t.id = sub.task_id
      WHERE sub.team_id = $1 AND sub.status = 'approved' AND sub.task_id IS NOT NULL
      ORDER BY sub.reviewed_at DESC NULLS LAST
      LIMIT 1`,
    [teamId],
  );
  return res.rows;
}

/** Задания по списку id, в порядке списка — для запомненной ложной проверки. */
async function tasksByIds(client: PoolClient, ids: string[]): Promise<TaskBrief[]> {
  const res = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM tasks t
       JOIN UNNEST($1::uuid[]) WITH ORDINALITY AS o(id, ord) ON o.id = t.id
      ORDER BY o.ord`,
    [ids],
  );
  return res.rows;
}

/**
 * Подставной пул для диверсии «следующая проверка покажет ложь»: столько же
 * заданий, сколько в настоящем пуле, но других — и по возможности той же
 * сложности, чтобы ложь выглядела правдоподобно.
 */
async function buildFakeTaskPool(
  client: PoolClient,
  sector: Sector,
  real: TaskBrief[],
): Promise<TaskBrief[]> {
  const realIds = real.map((t) => t.id);
  const res = await client.query<TaskBrief>(
    `SELECT t.id, t.title, t.question
       FROM tasks t
      WHERE t.id <> ALL($1::uuid[])
      ORDER BY (t.difficulty_id = $2) DESC, random()
      LIMIT $3`,
    [realIds, sector.difficulty_id, Math.max(1, real.length)],
  );
  return res.rows;
}

function pickRandom<T>(pool: T[]): T | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function validateActionForSector(action: SectorActionType, sector: Sector, teamId: string): void {
  switch (action) {
    case 'capture':
      if (sector.is_home_base) {
        throw new AppError(400, 'Домашний сектор нельзя захватить');
      }
      if (sector.status !== 'free') {
        throw new AppError(400, 'Сектор не свободен');
      }
      return;
    case 'recapture':
      if (sector.is_home_base) {
        throw new AppError(400, 'Домашний сектор нельзя перезахватить');
      }
      if (sector.status !== 'captured' || sector.captured_by_team_id === teamId) {
        throw new AppError(400, 'Нельзя перезахватить этот сектор');
      }
      return;
    case 'fortify':
      if (sector.captured_by_team_id !== teamId) {
        throw new AppError(400, 'Сектор не принадлежит вашей команде');
      }
      if (sector.fortification_level >= MAX_FORTIFICATION) {
        throw new AppError(400, 'Максимальный уровень укрепления уже достигнут');
      }
      return;
    case 'remove_fortification':
      if (sector.is_home_base) {
        throw new AppError(400, 'С домашнего сектора нельзя снять укрепление');
      }
      if (sector.captured_by_team_id === teamId) {
        throw new AppError(400, 'Нельзя снимать укрепление со своего сектора');
      }
      if (sector.captured_by_team_id === null) {
        throw new AppError(400, 'Сектор не захвачен');
      }
      if (sector.fortification_level <= 0) {
        throw new AppError(400, 'На секторе нет укрепления');
      }
      return;
  }
}

/** Experience a team spends per teleport under the active "Телепорт" law. */
const TELEPORT_COST = 75;

export async function startAction(
  sectorId: string,
  userId: string,
  rawActionType: unknown,
  actingTeamId?: string,
  teleport = false,
): Promise<StartActionResponse> {
  const actionType = assertActionType(rawActionType);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamId = await resolveActingTeam(client, userId, actingTeamId);

    const sectorRes = await client.query<Sector>(
      'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
      [sectorId],
    );
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorRes.rows[0];

    if (sector.is_special) {
      throw new AppError(400, 'Особый сектор — действия недоступны');
    }

    validateActionForSector(actionType, sector, teamId);

    // Заряженные диверсии соперника снимаются в момент его действия.
    // «hard_reset» меняет и досягаемость (отсчёт от базы), и пул заданий,
    // поэтому берётся до проверок; «opponent_move» — пометка в журнале о том,
    // что этот ход выбирала команда-диверсант.
    const isSectorRun = actionType === 'capture' || actionType === 'recapture';
    const hardResetId = isSectorRun
      ? await diversionService.takeArmed(client, teamId, 'hard_reset')
      : null;
    const opponentMoveId = await diversionService.takeArmed(client, teamId, 'opponent_move');

    // Товар торговца «батут»: заряд берётся заранее, но тратится только если
    // сектор действительно не граничит с территорией команды.
    const trampolineId = await purchaseService.takeArmed(client, teamId, 'trampoline');
    let jumped = false;

    if (teleport) {
      // Teleport law ("Телепорт"): the team jumps to a sector of the SAME
      // difficulty as its anchor (last-captured sector), ignoring reach and the
      // border rule, for a flat experience cost. Unlimited uses. Only a
      // (re)capture can teleport — fortifying an owned sector never needs it.
      await assertTeleport(client, sector, teamId, actionType);
    } else {
      // Every action targets a sector on (or next to) the team's territory, so it
      // must fall within the endurance reach of the team's anchor. This subsumes
      // the old "must border an owned sector" rule and, for fortify too, forces a
      // team to walk its anchor over via waypoint captures ("перевалы").
      jumped = await assertWithinReach(
        client,
        sector,
        teamId,
        hardResetId !== null,
        trampolineId !== null,
      );
    }

    // Перезахват укреплённого сектора: команда должна либо снять всё укрепление
    // вручную, либо пробить его силой. Пробитие покрывает fortification_level
    // до уровня, заданного силой (см. penetrationFromStrength).
    if (actionType === 'recapture' && sector.fortification_level > 0) {
      const strength = await getTeamStat(client, teamId, 'strength');
      const penetration = penetrationFromStrength(strength);
      if (sector.fortification_level > penetration) {
        throw new AppError(
          400,
          `Сектор укреплён (уровень ${sector.fortification_level}). ` +
            `Пробитие вашей силы — ${penetration}. Сначала снимите укрепление.`,
        );
      }
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM task_submissions WHERE sector_id = $1 AND status = 'pending'`,
      [sectorId],
    );
    if (existing.rows.length > 0) {
      throw new AppError(409, 'По этому сектору уже есть заявка на рассмотрении');
    }

    // Одно действие на команду — кроме заряженного «раздвоения» мастера: оно
    // разрешает ровно вторую параллельную заявку и на ней же тратится.
    const teamPending = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM task_submissions WHERE team_id = $1 AND status = 'pending'`,
      [teamId],
    );
    const pendingCount = teamPending.rows[0]?.count ?? 0;
    let splitId: string | null = null;
    if (pendingCount > 0) {
      splitId =
        pendingCount === 1 ? await purchaseService.takeArmed(client, teamId, 'split_capture') : null;
      if (!splitId) {
        throw new AppError(409, 'У вашей команды уже есть активное действие — дождитесь модерации');
      }
    }

    // Товар мастера «К.И.П.»: сектор выдаёт уже сданное командой задание.
    // Побеждает диверсию «сектор как сложный» — товар куплен за жетон, — но
    // отсчёт от базы у той диверсии остаётся.
    const kipId = await purchaseService.takeArmed(client, teamId, 'kip');
    const kipPool = kipId ? await buildKipTaskPool(client, teamId) : [];

    const hardPool = hardResetId ? await buildHardTaskPool(client) : [];
    const taskPool =
      kipPool.length > 0
        ? kipPool
        : hardPool.length > 0
          ? hardPool
          : await buildTaskPool(client, sector);
    const picked = pickRandom(taskPool);
    const taskId = picked ? picked.id : null;

    if (actionType === 'capture' || actionType === 'recapture') {
      await client.query(
        `UPDATE sectors SET
           status = 'capturing',
           capturing_by_team_id = $1,
           capture_started_at = NOW(),
           current_action_type = $2
         WHERE id = $3`,
        [teamId, actionType, sectorId],
      );
    } else {
      await client.query(
        'UPDATE sectors SET current_action_type = $1 WHERE id = $2',
        [actionType, sectorId],
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO task_submissions
         (sector_id, team_id, user_id, task_id, action_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [sectorId, teamId, userId, taskId, actionType],
    );

    const diversions: DiversionKind[] = [];
    if (hardResetId) {
      await diversionService.consume(client, hardResetId, {
        sectorId,
        note:
          hardPool.length > 0
            ? 'Сектор выдан как сложный, отсчёт от базы'
            : 'Отсчёт от базы (сложных заданий в пуле нет)',
      });
      diversions.push('hard_reset');
    }
    if (opponentMoveId) {
      await diversionService.consume(client, opponentMoveId, {
        sectorId,
        note: 'Ход выбран командой-диверсантом',
      });
      diversions.push('opponent_move');
    }

    // Импланты команды: батут тратится только на реальном прыжке, раздвоение —
    // на второй параллельной заявке, К.И.П. — на скопированном задании.
    const purchases: PurchaseKind[] = [];
    if (trampolineId && jumped) {
      await purchaseService.consume(client, trampolineId, {
        sectorId,
        note: 'Прыжок через сектор',
      });
      purchases.push('trampoline');
    }
    if (splitId) {
      await purchaseService.consume(client, splitId, {
        sectorId,
        note: 'Второй сектор начат параллельно',
      });
      purchases.push('split_capture');
    }
    if (kipId && kipPool.length > 0) {
      await purchaseService.consume(client, kipId, {
        sectorId,
        note: 'Задание скопировано с прошлого действия',
      });
      purchases.push('kip');
    }

    // A capture attempt rolls a random encounter for the acting team; it is
    // shown and resolved inside the capture window.
    let encounterInstanceId: string | null = null;
    if (actionType === 'capture' || actionType === 'recapture') {
      const seasonId = await seasonService.getActiveSeasonId(client);
      encounterInstanceId = await encounterService.rollForCapture(
        client,
        inserted.rows[0].id,
        teamId,
        seasonId,
      );
    }

    await client.query('COMMIT');

    const submission = await getById(inserted.rows[0].id);
    const encounter = encounterInstanceId
      ? await encounterService.getInstanceView(encounterInstanceId)
      : null;
    return { submission, task_pool: taskPool, encounter, diversions, purchases };
  } catch (error) {
    await client.query('ROLLBACK');
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === '23505'
    ) {
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === 'idx_task_submissions_one_pending_per_team') {
        throw new AppError(409, 'У вашей команды уже есть активное действие — дождитесь модерации');
      }
      if (constraint === 'idx_task_submissions_one_pending_per_sector') {
        throw new AppError(409, 'По этому сектору уже есть заявка на рассмотрении');
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

const DETAILS_SELECT = `
  SELECT
    sub.id,
    sub.sector_id,
    sub.team_id,
    sub.user_id,
    sub.task_id,
    sub.action_type,
    sub.status,
    sub.comment,
    sub.reviewed_by,
    sub.reviewed_at,
    sub.created_at,
    sub.updated_at,
    sub.reroll_count,
    -- Reroll cap from the team's luck (mirrors rerollsFromLuck).
    (SELECT CASE
       WHEN COUNT(*) >= 10 THEN 3
       WHEN COUNT(*) >= 8 THEN 2
       WHEN COUNT(*) >= 5 THEN 1
       ELSE 0 END
     FROM team_stat_upgrades WHERE team_id = sub.team_id AND stat_name = 'luck') AS rerolls_max,
    -- Закон «Рука помощи»: неистраченный доп. реролл сверх лимита удачи.
    EXISTS (
      SELECT 1 FROM team_law_effects e
       WHERE e.team_id = sub.team_id
         AND e.kind = 'extra_reroll'
         AND e.status = 'armed'
    ) AS extra_reroll,
    t.id AS team_row_id,
    t.name AS team_name,
    t.color AS team_color,
    s.id AS sector_row_id,
    s.number AS sector_number,
    s.q AS sector_q,
    s.r AS sector_r,
    dl.id AS difficulty_id,
    dl.name AS difficulty_name,
    dl.slug AS difficulty_slug,
    dl.influence_reward AS difficulty_influence_reward,
    dl.experience_reward AS difficulty_experience_reward,
    tk.id AS task_row_id,
    tk.title AS task_title,
    tk.question AS task_question,
    u.id AS user_row_id,
    u.username AS user_username,
    s.merchant_type AS sector_merchant_type,
    -- «Без очереди» с колеса фортуны: заявка такой команды идёт первой.
    EXISTS (
      SELECT 1 FROM team_law_effects e
       WHERE e.team_id = sub.team_id
         AND e.kind = 'queue_priority'
         AND e.status = 'armed'
    ) AS queue_priority
  FROM task_submissions sub
  JOIN teams t ON t.id = sub.team_id
  JOIN sectors s ON s.id = sub.sector_id
  JOIN difficulty_levels dl ON dl.id = s.difficulty_id
  JOIN users u ON u.id = sub.user_id
  LEFT JOIN tasks tk ON tk.id = sub.task_id
`;

type DetailsRow = {
  id: string;
  sector_id: string;
  team_id: string;
  user_id: string;
  task_id: string | null;
  action_type: SectorActionType;
  status: SubmissionStatus;
  comment: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  reroll_count: number;
  rerolls_max: number;
  team_row_id: string;
  team_name: string;
  team_color: string | null;
  sector_row_id: string;
  sector_number: number | null;
  sector_q: number;
  sector_r: number;
  difficulty_id: string;
  difficulty_name: string;
  difficulty_slug: 'easy' | 'medium' | 'hard' | 'core';
  difficulty_influence_reward: number;
  difficulty_experience_reward: number;
  task_row_id: string | null;
  task_title: string | null;
  task_question: string | null;
  user_row_id: string;
  user_username: string;
  sector_merchant_type: string | null;
  queue_priority: boolean;
  extra_reroll: boolean;
};

function rowToDetails(row: DetailsRow): TaskSubmissionWithDetails {
  return {
    id: row.id,
    sector_id: row.sector_id,
    team_id: row.team_id,
    user_id: row.user_id,
    task_id: row.task_id,
    action_type: row.action_type,
    status: row.status,
    comment: row.comment,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    team: {
      id: row.team_row_id,
      name: row.team_name,
      color: row.team_color,
    },
    sector: {
      id: row.sector_row_id,
      number: row.sector_number,
      q: row.sector_q,
      r: row.sector_r,
    },
    difficulty: {
      id: row.difficulty_id,
      name: row.difficulty_name,
      slug: row.difficulty_slug,
      influence_reward: row.difficulty_influence_reward,
      experience_reward: row.difficulty_experience_reward,
    },
    task:
      row.task_row_id && row.task_title !== null && row.task_question !== null
        ? {
            id: row.task_row_id,
            title: row.task_title,
            question: row.task_question,
          }
        : null,
    user: {
      id: row.user_row_id,
      username: row.user_username,
    },
    reroll_count: row.reroll_count,
    rerolls_max: row.rerolls_max ?? 0,
    // Admin-only: stripped for players in getCurrentForSector below.
    merchant_type: (row.sector_merchant_type ?? null) as MerchantType | null,
    queue_priority: row.queue_priority ?? false,
    extra_reroll: row.extra_reroll ?? false,
  };
}

export async function getById(id: string): Promise<TaskSubmissionWithDetails> {
  const res = await pool.query<DetailsRow>(
    `${DETAILS_SELECT} WHERE sub.id = $1`,
    [id],
  );
  if (res.rows.length === 0) {
    throw new AppError(404, 'Submission not found');
  }
  return rowToDetails(res.rows[0]);
}

export async function getCurrentForSector(
  sectorId: string,
  userId: string,
): Promise<TaskSubmissionWithDetails | null> {
  const userRes = await pool.query<{ team_id: string | null; role: 'admin' | 'student' }>(
    'SELECT team_id, role FROM users WHERE id = $1',
    [userId],
  );
  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }
  const { team_id, role } = userRes.rows[0];

  const res = await pool.query<DetailsRow>(
    `${DETAILS_SELECT}
     WHERE sub.sector_id = $1 AND sub.status = 'pending'
     ORDER BY sub.created_at DESC
     LIMIT 1`,
    [sectorId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (role !== 'admin' && row.team_id !== team_id) return null;
  const details = rowToDetails(row);
  // Merchants stay hidden from teams — only the admin queue sees the marker.
  return role === 'admin' ? details : { ...details, merchant_type: null };
}

export async function getPending(): Promise<TaskSubmissionWithDetails[]> {
  const res = await pool.query<DetailsRow>(
    // «Без очереди» поднимает заявку наверх; внутри группы — по времени подачи.
    `${DETAILS_SELECT} WHERE sub.status = 'pending'
      ORDER BY queue_priority DESC, sub.created_at ASC`,
  );
  return res.rows.map(rowToDetails);
}

/**
 * «Без очереди» с колеса фортуны гаснет, как только председатель разобрал
 * заявку команды: плюшка про одну проверку вперёд остальных, а не про
 * постоянный приоритет. Сброс сектора самой командой её не тратит — заявку
 * никто не проверял.
 */
async function consumeQueuePriority(
  client: PoolClient,
  submission: TaskSubmission,
): Promise<void> {
  const priorityId = await lawService.takeArmed(
    client,
    submission.team_id,
    'queue_priority',
  );
  if (priorityId) {
    await lawService.consume(client, priorityId, {
      sectorId: submission.sector_id,
      note: 'Заявка разобрана вне очереди',
    });
  }
}

type ApprovedEffect = { merchant: MerchantType | null; tokenMinted: boolean };

async function applyApprovedEffect(
  client: PoolClient,
  submission: TaskSubmission,
): Promise<ApprovedEffect> {
  const sectorRes = await client.query<Sector>(
    'SELECT * FROM sectors WHERE id = $1 FOR UPDATE',
    [submission.sector_id],
  );
  if (sectorRes.rows.length === 0) {
    throw new AppError(404, 'Sector not found');
  }
  const sector = sectorRes.rows[0];

  switch (submission.action_type) {
    case 'capture':
    case 'recapture': {
      // Диверсия «соперник не получает награду за сектор»: сектор достаётся
      // пустым. Влияние гасит флаг no_reward (его учитывает influenceExpr),
      // опыт — компенсирующий штраф ниже, потому что опыт считается по журналу
      // захватов и флаг сектора его не видит.
      const noRewardId = await diversionService.takeArmed(
        client,
        submission.team_id,
        'no_reward',
      );

      // Захваченный сектор всегда достаётся новому владельцу без укрепления —
      // укрепление чужой команды не наследуется. Чтобы поднять уровень,
      // команда должна сама выполнить fortify.
      await client.query(
        `UPDATE sectors SET
           status = 'captured',
           captured_by_team_id = $1,
           capturing_by_team_id = NULL,
           capture_started_at = NULL,
           current_action_type = NULL,
           fortification_level = 0,
           no_reward = $3,
           reward_multiplier = CASE
             WHEN difficulty_id IN (SELECT id FROM difficulty_levels WHERE slug = 'core') THEN 1
             ELSE COALESCE(
               (SELECT value::numeric FROM game_settings WHERE key = 'reward_multiplier'), 1
             )
           END
         WHERE id = $2`,
        [submission.team_id, submission.sector_id, noRewardId !== null],
      );
      await client.query(
        'INSERT INTO sector_captures (sector_id, team_id) VALUES ($1, $2)',
        [submission.sector_id, submission.team_id],
      );
      // Занятый сектор носит цвет владельца — краска граффити на нём сходит.
      await lawService.clearGraffitiOnCapture(client, submission.sector_id);

      if (noRewardId) {
        const rewardRes = await client.query<{ experience: number }>(
          `SELECT ROUND(dl.experience_reward * s.reward_multiplier)::int AS experience
             FROM sectors s
             JOIN difficulty_levels dl ON dl.id = s.difficulty_id
            WHERE s.id = $1`,
          [submission.sector_id],
        );
        const experience = rewardRes.rows[0]?.experience ?? 0;
        if (experience > 0) {
          await client.query(
            `INSERT INTO team_penalties
               (team_id, influence, experience, reason, sector_id, submission_id)
             VALUES ($1, 0, $2, 'diversion_no_reward', $3, $4)`,
            [submission.team_id, experience, submission.sector_id, submission.id],
          );
        }
        await diversionService.consume(client, noRewardId, {
          sectorId: submission.sector_id,
          note: `Сектор без награды (опыт −${experience})`,
        });
      }
      // A capture refreshes the team's scouting budget: clear its peeks.
      await client.query('DELETE FROM sector_peeks WHERE team_id = $1', [submission.team_id]);
      // A hidden merchant on this sector mints a one-off purchase token for the
      // team. UNIQUE(team_id, sector_id) makes recapture idempotent — no farming.
      const merchantType =
        ((sector as { merchant_type?: string | null }).merchant_type ?? null) as MerchantType | null;
      let tokenMinted = false;
      if (merchantType) {
        const ins = await client.query(
          `INSERT INTO team_purchase_tokens (team_id, sector_id, merchant_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (team_id, sector_id) DO NOTHING`,
          [submission.team_id, submission.sector_id, merchantType],
        );
        tokenMinted = (ins.rowCount ?? 0) > 0;
      }
      return { merchant: merchantType, tokenMinted };
    }
    case 'fortify': {
      const next = Math.min(sector.fortification_level + 1, MAX_FORTIFICATION);
      await client.query(
        `UPDATE sectors SET
           fortification_level = $1,
           current_action_type = NULL
         WHERE id = $2`,
        [next, submission.sector_id],
      );
      // Опыт за укрепление не сгорает — пишем в журнал, как захват в
      // sector_captures. Упёршийся в потолок уровень ничего не приносит.
      if (next > sector.fortification_level) {
        await client.query(
          'INSERT INTO sector_fortification_awards (sector_id, team_id) VALUES ($1, $2)',
          [submission.sector_id, submission.team_id],
        );
      }
      return { merchant: null, tokenMinted: false };
    }
    case 'remove_fortification': {
      const next = Math.max(sector.fortification_level - 1, 0);
      await client.query(
        `UPDATE sectors SET
           fortification_level = $1,
           current_action_type = NULL
         WHERE id = $2`,
        [next, submission.sector_id],
      );
      return { merchant: null, tokenMinted: false };
    }
  }
  return { merchant: null, tokenMinted: false };
}

async function revertPendingEffect(
  client: PoolClient,
  submission: TaskSubmission,
): Promise<void> {
  if (submission.action_type === 'capture' || submission.action_type === 'recapture') {
    await client.query(
      `UPDATE sectors SET
         status = CASE WHEN captured_by_team_id IS NULL THEN 'free' ELSE 'captured' END,
         capturing_by_team_id = NULL,
         capture_started_at = NULL,
         current_action_type = NULL
       WHERE id = $1`,
      [submission.sector_id],
    );
  } else {
    await client.query(
      'UPDATE sectors SET current_action_type = NULL WHERE id = $1',
      [submission.sector_id],
    );
  }
}

export type ApproveResult = TaskSubmissionWithDetails & {
  /** Merchant found on the sector by this capture (null if none). */
  merchant: MerchantType | null;
  /** True only when a fresh purchase token was minted (not a re-looted sector). */
  merchant_token_minted: boolean;
};

export async function approve(
  id: string,
  reviewerId: string,
  comment: string | null,
): Promise<ApproveResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];

    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже обработана');
    }

    const effect = await applyApprovedEffect(client, submission);
    await consumeQueuePriority(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'approved',
         comment = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [comment, reviewerId, id],
    );

    await client.query('COMMIT');
    const details = await getById(id);
    return { ...details, merchant: effect.merchant, merchant_token_minted: effect.tokenMinted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reject(
  id: string,
  reviewerId: string,
  comment: string | null,
): Promise<TaskSubmissionWithDetails> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];

    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже обработана');
    }

    await revertPendingEffect(client, submission);
    await consumeQueuePriority(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'rejected',
         comment = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [comment, reviewerId, id],
    );

    await client.query('COMMIT');
    return getById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface DropResponse {
  submission: TaskSubmissionWithDetails;
  penalty: { influence: number; experience: number };
  level_before: number;
  level_after: number;
  removed_stats: StatName[];
}

async function calculateLevelInTx(
  client: PoolClient,
  teamId: string,
): Promise<number> {
  const expRes = await client.query<{ experience: number }>(
    `SELECT ${experienceExpr('$1')} AS experience`,
    [teamId],
  );
  const experience = expRes.rows[0].experience;

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

  let level = 0;
  let remaining = experience;
  let threshold = baseExp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level++;
    threshold += expStep;
  }
  return level;
}

export async function dropPending(
  submissionId: string,
  userId: string,
): Promise<DropResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];

    // Председатель дропает сектора за любую команду; обычный игрок — только свои.
    // В обоих случаях штраф ложится на команду-автора заявки.
    const userRes = await client.query<{ team_id: string | null; role: string }>(
      'SELECT team_id, role FROM users WHERE id = $1',
      [userId],
    );
    if (userRes.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    const { team_id: userTeamId, role } = userRes.rows[0];
    if (role !== 'admin' && submission.team_id !== userTeamId) {
      throw new AppError(403, 'Это задание не вашей команды');
    }
    const teamId = submission.team_id;

    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже закрыта');
    }

    const sectorRewardsRes = await client.query<{
      influence_reward: number;
      experience_reward: number;
    }>(
      `SELECT dl.influence_reward, dl.experience_reward
         FROM sectors s
         JOIN difficulty_levels dl ON dl.id = s.difficulty_id
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [submission.sector_id],
    );
    if (sectorRewardsRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const { influence_reward, experience_reward } = sectorRewardsRes.rows[0];

    // Товар торговца «подушка безопасности» гасит штраф за сброс целиком.
    // Стрик она не спасает — полоса всё равно сбивается.
    const airbagId = await purchaseService.takeArmed(client, teamId, 'airbag');
    const penaltyInfluence = airbagId ? 0 : Math.floor(influence_reward / 2);
    const penaltyExperience = airbagId ? 0 : Math.floor(experience_reward / 2);

    const levelBefore = await calculateLevelInTx(client, teamId);

    if (airbagId) {
      await purchaseService.consume(client, airbagId, {
        sectorId: submission.sector_id,
        note: 'Сброс без штрафа',
      });
    } else {
      await client.query(
        `INSERT INTO team_penalties
           (team_id, influence, experience, reason, sector_id, submission_id)
         VALUES ($1, $2, $3, 'drop', $4, $5)`,
        [
          teamId,
          penaltyInfluence,
          penaltyExperience,
          submission.sector_id,
          submission.id,
        ],
      );
    }

    await revertPendingEffect(client, submission);

    await client.query(
      `UPDATE task_submissions SET
         status = 'rejected',
         comment = $1,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $2`,
      ['Сектор сброшен командой', submissionId],
    );

    const levelAfter = await calculateLevelInTx(client, teamId);
    const levelsLost = Math.max(0, levelBefore - levelAfter);
    const removedStats: StatName[] = [];
    for (let i = 0; i < levelsLost; i++) {
      const removed = await client.query<{ stat_name: StatName }>(
        `DELETE FROM team_stat_upgrades
          WHERE id = (
            SELECT id FROM team_stat_upgrades
             WHERE team_id = $1
             ORDER BY random()
             LIMIT 1
          )
          RETURNING stat_name`,
        [teamId],
      );
      if (removed.rows.length === 0) break;
      removedStats.push(removed.rows[0].stat_name);
    }

    await client.query('COMMIT');

    const updated = await getById(submissionId);
    return {
      submission: updated,
      penalty: { influence: penaltyInfluence, experience: penaltyExperience },
      level_before: levelBefore,
      level_after: levelAfter,
      removed_stats: removedStats,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface RerollResponse {
  submission: TaskSubmissionWithDetails;
  task_pool: TaskBrief[];
  rerolls_remaining: number;
}

/**
 * Reroll (удача): swap the assigned task for another from the sector's pool.
 * Capped by the team's luck; each reroll bumps reroll_count. Admins may reroll
 * on behalf of the acting team.
 */
export async function rerollTask(
  submissionId: string,
  userId: string,
  actingTeamId?: string,
): Promise<RerollResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query<TaskSubmission>(
      'SELECT * FROM task_submissions WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (subRes.rows.length === 0) {
      throw new AppError(404, 'Submission not found');
    }
    const submission = subRes.rows[0];
    if (submission.status !== 'pending') {
      throw new AppError(409, 'Заявка уже обработана — реролл недоступен');
    }

    const teamId = await resolveActingTeam(client, userId, actingTeamId);
    if (submission.team_id !== teamId) {
      throw new AppError(403, 'Это задание не вашей команды');
    }

    const luck = await getTeamStat(client, teamId, 'luck');
    const cap = rerollsFromLuck(luck);
    // Закон «Рука помощи» даёт один реролл сверх лимита удачи: он тратится
    // только когда свои кончились, и гаснет сразу — второго у команды нет.
    let extraRerollId: string | null = null;
    if (submission.reroll_count >= cap) {
      extraRerollId = await lawService.takeArmed(client, teamId, 'extra_reroll');
      if (!extraRerollId) {
        throw new AppError(
          400,
          cap === 0
            ? 'Реролл недоступен — нужна удача'
            : `Рероллы закончились (использовано ${submission.reroll_count} из ${cap})`,
        );
      }
    }

    const sectorRes = await client.query<Sector>('SELECT * FROM sectors WHERE id = $1', [
      submission.sector_id,
    ]);
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const taskPool = await buildTaskPool(client, sectorRes.rows[0]);
    if (taskPool.length === 0) {
      throw new AppError(400, 'У сектора нет заданий для реролла');
    }
    // Prefer a task different from the current one when the pool allows.
    const others = taskPool.filter((t) => t.id !== submission.task_id);
    const picked = pickRandom(others.length > 0 ? others : taskPool)!;

    await client.query(
      `UPDATE task_submissions
          SET task_id = $1, reroll_count = reroll_count + 1, updated_at = NOW()
        WHERE id = $2`,
      [picked.id, submissionId],
    );

    if (extraRerollId) {
      await lawService.consume(client, extraRerollId, {
        sectorId: submission.sector_id,
        note: 'Потрачен на перекрут задания',
      });
    }

    await client.query('COMMIT');
    const updated = await getById(submissionId);
    return {
      submission: updated,
      task_pool: taskPool,
      // Свои рероллы могли уже кончиться — тогда остаток нулевой, а перекрут
      // прошёл за счёт «руки помощи».
      rerolls_remaining: Math.max(0, cap - updated.reroll_count),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface PeekResponse {
  task_pool: TaskBrief[];
  checks_remaining: number;
}

/**
 * Check / проверка (интеллект): preview a sector's task pool before committing.
 * Each distinct peeked sector costs one check; the budget comes from intelligence
 * and refreshes on capture. Re-peeking an already-scouted sector is free.
 */
export async function peekSector(
  sectorId: string,
  userId: string,
  actingTeamId?: string,
): Promise<PeekResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamId = await resolveActingTeam(client, userId, actingTeamId);

    const sectorRes = await client.query<Sector>('SELECT * FROM sectors WHERE id = $1', [sectorId]);
    if (sectorRes.rows.length === 0) {
      throw new AppError(404, 'Sector not found');
    }
    const sector = sectorRes.rows[0];
    if (sector.is_special) {
      throw new AppError(400, 'Особый сектор — проверка недоступна');
    }

    const intelligence = await getTeamStat(client, teamId, 'intelligence');
    const cap = checksFromIntelligence(intelligence);

    const already = await client.query<{ id: string; lie_task_ids: string[] | null }>(
      'SELECT id, lie_task_ids FROM sector_peeks WHERE team_id = $1 AND sector_id = $2',
      [teamId, sectorId],
    );
    const usedRes = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM sector_peeks WHERE team_id = $1',
      [teamId],
    );
    const used = usedRes.rows[0]?.count ?? 0;

    let lie: TaskBrief[] | null = null;
    let spyglassId: string | null = null;

    if (already.rows.length > 0) {
      // Уже проверенный сектор: если проверку подменила диверсия, повторный
      // (бесплатный) просмотр обязан показать ту же ложь.
      const stored = already.rows[0].lie_task_ids;
      if (stored && stored.length > 0) {
        lie = await tasksByIds(client, stored);
      }
    } else {
      if (used >= cap) {
        // Товар торговца «подзорная труба» держит три проверки сверх интеллекта:
        // когда бюджет исчерпан, следующая уходит с неё.
        spyglassId = await purchaseService.takeArmed(client, teamId, 'spyglass');
        if (!spyglassId) {
          throw new AppError(
            400,
            cap === 0
              ? 'Проверка недоступна — нужен интеллект'
              : `Проверки закончились (использовано ${used} из ${cap})`,
          );
        }
      }

      // Диверсия «следующая проверка покажет ложь»: проверка тратится как
      // обычно, но пул подменяется — и подмена запоминается.
      const lieId = await diversionService.takeArmed(client, teamId, 'false_scouting');
      if (lieId) {
        const real = await buildTaskPool(client, sector);
        const fake = await buildFakeTaskPool(client, sector, real);
        if (fake.length > 0) {
          lie = fake;
          await diversionService.consume(client, lieId, {
            sectorId,
            note: 'Проверка показала ложный пул',
          });
        }
      }

      await client.query(
        `INSERT INTO sector_peeks (team_id, sector_id, lie_task_ids) VALUES ($1, $2, $3)
         ON CONFLICT (team_id, sector_id) DO NOTHING`,
        [teamId, sectorId, lie ? lie.map((t) => t.id) : null],
      );
    }

    if (spyglassId) {
      await purchaseService.consume(client, spyglassId, {
        sectorId,
        note: 'Проверка с подзорной трубы',
      });
    }

    const taskPool = lie ?? (await buildTaskPool(client, sector));
    // Остаток проверок — бюджет интеллекта плюс невыработанные заряды трубы.
    const spyglass = await purchaseService.chargesLeft(client, teamId, 'spyglass');
    await client.query('COMMIT');

    const nowUsed = already.rows.length === 0 ? used + 1 : used;
    return {
      task_pool: taskPool,
      checks_remaining: Math.max(0, cap - nowUsed) + spyglass,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
