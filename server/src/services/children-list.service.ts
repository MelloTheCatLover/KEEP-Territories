import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { ChildrenList, RosterEntry } from '../types/season';

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
    `SELECT id, list_id, full_name, code, user_id, created_at
       FROM roster_entries
      WHERE list_id = $1
      ORDER BY full_name ASC`,
    [listId],
  );
  return res.rows;
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
      const res = await pool.query<RosterEntry>(
        `INSERT INTO roster_entries (list_id, full_name, code)
         VALUES ($1, $2, $3)
         RETURNING id, list_id, full_name, code, user_id, created_at`,
        [listId, name, entryCode],
      );
      return res.rows[0];
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
