import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { ChildrenList, RosterEntry } from '../types/season';
import { encryptSecret, decryptSecret } from '../config/crypto';

// Codes are handed to children to claim their account at registration. Avoid
// ambiguous characters (0/O, 1/I) so they are easy to read off a printed list.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

const SALT_ROUNDS = 12;
// Readable password alphabet (no ambiguous chars) — handed to children on paper.
const PWD_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const PWD_LENGTH = 8;

function randomPassword(): string {
  let out = '';
  for (let i = 0; i < PWD_LENGTH; i++) {
    out += PWD_ALPHABET[Math.floor(Math.random() * PWD_ALPHABET.length)];
  }
  return out;
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

export async function listAll(): Promise<ChildrenList[]> {
  const res = await pool.query<ChildrenList>(
    `SELECT cl.id, cl.name, cl.created_at,
            COUNT(re.id)::int AS entry_count
       FROM children_lists cl
       LEFT JOIN roster_entries re ON re.list_id = cl.id
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
    `INSERT INTO children_lists (name) VALUES ($1)
     RETURNING id, name, created_at`,
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

export async function getEntries(listId: string): Promise<RosterEntry[]> {
  const listRes = await pool.query('SELECT id FROM children_lists WHERE id = $1', [listId]);
  if (listRes.rows.length === 0) {
    throw new AppError(404, 'Список не найден');
  }
  const res = await pool.query<RosterEntry>(
    `SELECT re.id, re.list_id, re.full_name, re.code, re.user_id,
            u.username AS username, u.email AS login,
            re.issued_password, re.created_at
       FROM roster_entries re
       LEFT JOIN users u ON u.id = re.user_id
      WHERE re.list_id = $1
      ORDER BY re.full_name ASC`,
    [listId],
  );
  // Stored encrypted at rest; decrypt for the admin who requested the list.
  return res.rows.map((r) => ({ ...r, issued_password: decryptSecret(r.issued_password) }));
}

export async function addEntry(
  listId: string,
  fullName: string,
  code?: string,
): Promise<RosterEntry> {
  const name = fullName.trim();
  if (name.length === 0 || name.length > 120) {
    throw new AppError(400, 'Имя ребёнка: 1..120 символов');
  }

  const listRes = await pool.query('SELECT id FROM children_lists WHERE id = $1', [listId]);
  if (listRes.rows.length === 0) {
    throw new AppError(404, 'Список не найден');
  }

  const wantedCode = code?.trim();
  if (wantedCode && wantedCode.length > 32) {
    throw new AppError(400, 'Код: максимум 32 символа');
  }

  // Insert with retries to dodge the rare random-code collision when auto-generating.
  for (let attempt = 0; attempt < 6; attempt++) {
    const entryCode = wantedCode || randomCode();
    try {
      const res = await pool.query<
        Omit<RosterEntry, 'username' | 'login' | 'issued_password'>
      >(
        `INSERT INTO roster_entries (list_id, full_name, code)
         VALUES ($1, $2, $3)
         RETURNING id, list_id, full_name, code, user_id, created_at`,
        [listId, name, entryCode],
      );
      // A freshly added entry is always unclaimed, so no account yet.
      return { ...res.rows[0], username: null, login: null, issued_password: null };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        if (wantedCode) {
          throw new AppError(409, 'Такой код уже используется');
        }
        continue; // regenerate
      }
      throw err;
    }
  }
  throw new AppError(500, 'Не удалось сгенерировать уникальный код');
}

export async function removeEntry(entryId: string): Promise<void> {
  const res = await pool.query('DELETE FROM roster_entries WHERE id = $1', [entryId]);
  if (res.rowCount === 0) {
    throw new AppError(404, 'Запись не найдена');
  }
}

export interface IssuedAccount {
  login: string;
  password: string;
  entry: RosterEntry;
}

/**
 * Create an account for a roster entry and link it. Returns the generated
 * login + plaintext password so the admin can hand the credentials to the
 * child; the password is also stored on the entry for later lookup/export.
 * The entry must not already be claimed.
 */
export async function issueAccount(entryId: string): Promise<IssuedAccount> {
  const entryRes = await pool.query<
    Omit<RosterEntry, 'username' | 'login' | 'issued_password'>
  >(
    'SELECT id, list_id, full_name, code, user_id, created_at FROM roster_entries WHERE id = $1',
    [entryId],
  );
  if (entryRes.rows.length === 0) {
    throw new AppError(404, 'Запись не найдена');
  }
  const entry = entryRes.rows[0];
  if (entry.user_id) {
    throw new AppError(409, 'У этого ребёнка уже есть аккаунт');
  }

  const base = handleFromName(entry.full_name).slice(0, 30);
  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? '' : `-${randomCode().slice(0, 3).toLowerCase()}`;
    const login = `${base}${suffix}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lock = await client.query<{ user_id: string | null }>(
        'SELECT user_id FROM roster_entries WHERE id = $1 FOR UPDATE',
        [entryId],
      );
      if (lock.rows.length === 0) {
        throw new AppError(404, 'Запись не найдена');
      }
      if (lock.rows[0].user_id) {
        throw new AppError(409, 'У этого ребёнка уже есть аккаунт');
      }

      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (email, username, password_hash, full_name)
         VALUES ($1, $1, $2, $3)
         RETURNING id`,
        [login, passwordHash, entry.full_name],
      );
      const userId = userRes.rows[0].id;

      await client.query(
        'UPDATE roster_entries SET user_id = $1, issued_password = $2 WHERE id = $3',
        [userId, encryptSecret(password), entryId],
      );
      await client.query('COMMIT');

      return {
        login,
        password,
        entry: {
          ...entry,
          user_id: userId,
          username: login,
          login,
          issued_password: password,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof AppError) throw err;
      const e = err as { code?: string };
      if (e.code === '23505') continue; // login/username taken — retry with a new suffix
      throw err;
    } finally {
      client.release();
    }
  }
  throw new AppError(500, 'Не удалось сгенерировать уникальный логин');
}
