import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import {
  ChildrenList,
  ListMember,
  AddChildResult,
  IssuedAccount,
  ChildDashboardRow,
} from '../types/season';
import { encryptSecret, decryptSecret } from '../config/crypto';

const SALT_ROUNDS = 12;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Readable password alphabet (no ambiguous chars) — handed to children on paper.
const PWD_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const PWD_LENGTH = 8;

function randomFrom(alphabet: string, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Whitespace-normalized name used to recognize the same child across lists. */
function nameKey(fullName: string): string {
  return fullName.trim().replace(/\s+/g, ' ');
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Build a latin handle from a full name, e.g. "Петров Пётр" → "petrov-petr". */
function handleFromName(fullName: string): string {
  const latin = fullName
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return latin || 'user';
}

// ── Lists ──────────────────────────────────────────────────────────────────

export async function listAll(): Promise<ChildrenList[]> {
  const res = await pool.query<ChildrenList>(
    `SELECT cl.id, cl.name, cl.created_at,
            COUNT(lm.child_id)::int AS entry_count
       FROM children_lists cl
       LEFT JOIN list_members lm ON lm.list_id = cl.id
      GROUP BY cl.id
      ORDER BY cl.created_at DESC`,
  );
  return res.rows;
}

export async function create(name: string): Promise<ChildrenList> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new AppError(400, 'Название списка: 1..100 символов');
  }
  const res = await pool.query<{ id: string; name: string; created_at: string }>(
    `INSERT INTO children_lists (name) VALUES ($1) RETURNING id, name, created_at`,
    [trimmed],
  );
  return { ...res.rows[0], entry_count: 0 };
}

export async function remove(id: string): Promise<void> {
  const res = await pool.query('DELETE FROM children_lists WHERE id = $1', [id]);
  if (res.rowCount === 0) {
    throw new AppError(404, 'Список не найден');
  }
}

// ── Members ────────────────────────────────────────────────────────────────

const MEMBER_SELECT = `
  SELECT c.id AS child_id, c.code, c.full_name, c.user_id, c.issued_password,
         u.email AS login,
         COALESCE(ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS seasons
    FROM list_members lm
    JOIN children c ON c.id = lm.child_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN list_members lm2 ON lm2.child_id = c.id
    LEFT JOIN season_lists sl ON sl.list_id = lm2.list_id
    LEFT JOIN seasons s ON s.id = sl.season_id
`;

function decryptMember(row: ListMember): ListMember {
  return { ...row, issued_password: decryptSecret(row.issued_password) };
}

export async function getMembers(listId: string): Promise<ListMember[]> {
  const listRes = await pool.query('SELECT id FROM children_lists WHERE id = $1', [listId]);
  if (listRes.rows.length === 0) {
    throw new AppError(404, 'Список не найден');
  }
  const res = await pool.query<ListMember>(
    `${MEMBER_SELECT}
      WHERE lm.list_id = $1
      GROUP BY c.id, u.email
      ORDER BY c.full_name ASC`,
    [listId],
  );
  return res.rows.map(decryptMember);
}

interface ChildLookup {
  id: string;
  code: string;
  full_name: string;
  user_id: string | null;
  login: string | null;
  seasons: string[];
}

async function findChildByName(name: string): Promise<ChildLookup | null> {
  const res = await pool.query<ChildLookup>(
    `SELECT c.id, c.code, c.full_name, c.user_id, u.email AS login,
            COALESCE(ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS seasons
       FROM children c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN list_members lm ON lm.child_id = c.id
       LEFT JOIN season_lists sl ON sl.list_id = lm.list_id
       LEFT JOIN seasons s ON s.id = sl.season_id
      WHERE c.name_key = $1
      GROUP BY c.id, u.email
      ORDER BY c.created_at ASC
      LIMIT 1`,
    [nameKey(name)],
  );
  return res.rows[0] ?? null;
}

/**
 * Add a child to a list. If a child with the same (whitespace-normalized) name
 * already exists, that child is reused (account and history carried over) and
 * matched=true; otherwise a new child is created.
 */
export async function addChild(listId: string, fullName: string): Promise<AddChildResult> {
  const name = fullName.trim();
  if (name.length === 0 || name.length > 120) {
    throw new AppError(400, 'ФИО: 1..120 символов');
  }
  const listRes = await pool.query('SELECT id FROM children_lists WHERE id = $1', [listId]);
  if (listRes.rows.length === 0) {
    throw new AppError(404, 'Список не найден');
  }

  const existing = await findChildByName(name);
  if (existing) {
    await pool.query(
      `INSERT INTO list_members (list_id, child_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [listId, existing.id],
    );
    return {
      child_id: existing.id,
      code: existing.code,
      full_name: existing.full_name,
      matched: true,
      login: existing.login,
      seasons: existing.seasons,
    };
  }

  const childRes = await pool.query<{ id: string; code: string }>(
    `INSERT INTO children (full_name, name_key) VALUES ($1, $2) RETURNING id, code`,
    [name, nameKey(name)],
  );
  const child = childRes.rows[0];
  await pool.query(
    `INSERT INTO list_members (list_id, child_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [listId, child.id],
  );
  return {
    child_id: child.id,
    code: child.code,
    full_name: name,
    matched: false,
    login: null,
    seasons: [],
  };
}

export async function bulkAdd(listId: string, raw: string[]): Promise<AddChildResult[]> {
  const names = raw.map((n) => n.trim()).filter((n) => n.length > 0);
  const results: AddChildResult[] = [];
  for (const name of names) {
    results.push(await addChild(listId, name));
  }
  return results;
}

/** Remove a child from a list. The child stays in the global registry. */
export async function removeMember(listId: string, childId: string): Promise<void> {
  const res = await pool.query(
    'DELETE FROM list_members WHERE list_id = $1 AND child_id = $2',
    [listId, childId],
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'Ребёнок не найден в списке');
  }
}

/**
 * Delete a child from the registry entirely: removes their list memberships
 * (cascade) and their account if any. Irreversible.
 */
export async function deleteChild(childId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{ user_id: string | null }>(
      'SELECT user_id FROM children WHERE id = $1 FOR UPDATE',
      [childId],
    );
    if (res.rows.length === 0) {
      throw new AppError(404, 'Ребёнок не найден');
    }
    const userId = res.rows[0].user_id;
    // children → list_members cascade; deleting the account cascades submissions.
    await client.query('DELETE FROM children WHERE id = $1', [childId]);
    if (userId) {
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Accounts ───────────────────────────────────────────────────────────────

/**
 * Create an account for a child (reused across all their shifts). Returns the
 * login + plaintext password once; the password is also stored encrypted for
 * later lookup/export. Fails if the child already has an account.
 */
export async function issueAccount(childId: string): Promise<IssuedAccount> {
  const childRes = await pool.query<{ full_name: string; user_id: string | null }>(
    'SELECT full_name, user_id FROM children WHERE id = $1',
    [childId],
  );
  if (childRes.rows.length === 0) {
    throw new AppError(404, 'Ребёнок не найден');
  }
  if (childRes.rows[0].user_id) {
    throw new AppError(409, 'У этого ребёнка уже есть аккаунт');
  }
  const fullName = childRes.rows[0].full_name;

  const base = handleFromName(fullName).slice(0, 30);
  const password = randomFrom(PWD_ALPHABET, PWD_LENGTH);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? '' : `-${randomFrom(CODE_ALPHABET, 3).toLowerCase()}`;
    const login = `${base}${suffix}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lock = await client.query<{ user_id: string | null }>(
        'SELECT user_id FROM children WHERE id = $1 FOR UPDATE',
        [childId],
      );
      if (lock.rows.length === 0) {
        throw new AppError(404, 'Ребёнок не найден');
      }
      if (lock.rows[0].user_id) {
        throw new AppError(409, 'У этого ребёнка уже есть аккаунт');
      }

      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (email, username, password_hash, full_name)
         VALUES ($1, $1, $2, $3) RETURNING id`,
        [login, passwordHash, fullName],
      );
      const userId = userRes.rows[0].id;

      await client.query(
        'UPDATE children SET user_id = $1, issued_password = $2 WHERE id = $3',
        [userId, encryptSecret(password), childId],
      );
      await client.query('COMMIT');

      return { login, password, child_id: childId };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof AppError) throw err;
      const e = err as { code?: string };
      if (e.code === '23505') continue; // login collision — retry with a new suffix
      throw err;
    } finally {
      client.release();
    }
  }
  throw new AppError(500, 'Не удалось сгенерировать уникальный логин');
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export async function dashboard(): Promise<ChildDashboardRow[]> {
  const res = await pool.query<ChildDashboardRow>(
    `SELECT c.id, c.code, c.full_name, u.email AS login,
            (c.user_id IS NOT NULL) AS has_account,
            COALESCE(ARRAY_AGG(DISTINCT cl.name) FILTER (WHERE cl.name IS NOT NULL), '{}') AS lists,
            COALESCE(ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS seasons
       FROM children c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN list_members lm ON lm.child_id = c.id
       LEFT JOIN children_lists cl ON cl.id = lm.list_id
       LEFT JOIN season_lists sl ON sl.list_id = lm.list_id
       LEFT JOIN seasons s ON s.id = sl.season_id
      GROUP BY c.id, u.email
      ORDER BY c.full_name ASC`,
  );
  return res.rows;
}
