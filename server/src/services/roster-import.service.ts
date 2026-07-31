/**
 * Import of the counselor's shift spreadsheet (ФИО / Искры / КТП / КТБ / Логин /
 * Пароль) into a children list: children are created or matched by name, their
 * prior standing is stored, and accounts are created with the logins and
 * passwords printed in the sheet so the handout stays correct.
 *
 * Used by the admin panel (POST /children-lists/:id/import) and by the
 * `import-roster` CLI script, which share the parser and the transaction below.
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db';
import { AppError } from '../types/errors';
import { encryptSecret } from '../config/crypto';
import { ParticipantCategory } from '../types/distribution';
import { RosterRow, RosterImportEntry, RosterImportResult } from '../types/season';

const SALT_ROUNDS = 12;
const MIN_PASSWORD = 6;

/** Sheet wording → system category. Unlisted wording is rejected loudly. */
const CATEGORY_BY_LABEL: Record<string, ParticipantCategory> = {
  'МВП': 'mvp',
  'Лучший в команде': 'mvp',
  'Победитель': 'winner',
  'Участник': 'participant',
  'Новенький': 'newbie',
};

// ── Parsing ────────────────────────────────────────────────────────────────

/** Delimiter of the header line: tab (Excel paste), semicolon (RU CSV) or comma. */
function detectDelimiter(text: string): string {
  const header = text.split('\n', 1)[0];
  for (const d of ['\t', ';', ',']) {
    if (header.includes(d)) return d;
  }
  return ';';
}

function parseTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Surname + given name, lowercased — same matching key as children-list.service. */
export function nameKey(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ').toLowerCase();
}

/**
 * Read the sheet (CSV / semicolon-CSV / tab-separated Excel paste). Columns are
 * found by header name, so their order does not matter; КТБ is ignored.
 * Throws a 400 with the offending line on any malformed row.
 */
export function parseRoster(text: string): RosterRow[] {
  const table = parseTable(text.replace(/^﻿/, ''), detectDelimiter(text));
  if (table.length < 2) {
    throw new AppError(400, 'Файл пуст или содержит только заголовок');
  }
  const header = table[0].map((h) => h.trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) {
      throw new AppError(400, `Нет колонки «${name}». Заголовок: ${header.join(', ')}`);
    }
    return i;
  };
  const [iName, iSparks, iCat, iLogin, iPwd] =
    ['ФИО', 'Искры', 'КТП', 'Логин', 'Пароль'].map(col);

  const rows = table.slice(1).map((cells, n) => {
    const line = n + 2;
    const full_name = (cells[iName] ?? '').trim();
    if (!full_name) throw new AppError(400, `Строка ${line}: пустое ФИО`);
    if (full_name.length > 120) throw new AppError(400, `Строка ${line}: ФИО длиннее 120 символов`);
    const label = (cells[iCat] ?? '').trim();
    const category = CATEGORY_BY_LABEL[label];
    if (!category) throw new AppError(400, `Строка ${line}: неизвестный статус КТП «${label}»`);
    const login = (cells[iLogin] ?? '').trim();
    if (!login) throw new AppError(400, `Строка ${line}: пустой логин`);
    const password = (cells[iPwd] ?? '').trim();
    if (password.length < MIN_PASSWORD) {
      throw new AppError(400, `Строка ${line}: пароль короче ${MIN_PASSWORD} символов`);
    }
    const sparks = Number((cells[iSparks] ?? '0').trim().replace(/\s/g, '')) || 0;
    return { full_name, sparks, category, login, password };
  });

  const dupeNames = rows.map((r) => nameKey(r.full_name)).filter((k, i, all) => all.indexOf(k) !== i);
  if (dupeNames.length > 0) {
    throw new AppError(400, `В файле повторяются дети: ${[...new Set(dupeNames)].join(', ')}`);
  }
  const dupeLogins = rows.map((r) => r.login).filter((l, i, all) => all.indexOf(l) !== i);
  if (dupeLogins.length > 0) {
    throw new AppError(400, `В файле повторяются логины: ${[...new Set(dupeLogins)].join(', ')}`);
  }
  return rows;
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Apply the parsed sheet to a list inside one transaction. With apply=false the
 * transaction is rolled back and the result is a preview: same numbers, same
 * per-child outcome, nothing written.
 *
 * Per row: the child is matched by surname + given name (created if missing),
 * base_category/sparks are overwritten from the sheet, the child joins the list,
 * and the password becomes the sheet's one. A child without an account gets one
 * under the sheet's login; an existing account keeps its login (reported back so
 * a mismatch with the sheet is visible) and only has its password reset.
 */
export async function importRoster(
  listId: string,
  rows: RosterRow[],
  apply: boolean,
): Promise<RosterImportResult> {
  // Hashing 40 passwords at 12 rounds takes seconds — do it off the transaction.
  // A preview is rolled back, so its placeholder hash never reaches a real login.
  const hashes = apply
    ? await Promise.all(rows.map((r) => bcrypt.hash(r.password, SALT_ROUNDS)))
    : rows.map(() => 'dry-run');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const listRes = await client.query<{ name: string }>(
      'SELECT name FROM children_lists WHERE id = $1',
      [listId],
    );
    if (listRes.rows.length === 0) {
      throw new AppError(404, 'Список не найден');
    }

    const entries: RosterImportEntry[] = [];
    for (const [i, row] of rows.entries()) {
      const key = nameKey(row.full_name);
      const found = await client.query<{ id: string; code: string; user_id: string | null }>(
        'SELECT id, code, user_id FROM children WHERE name_key = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
        [key],
      );
      let childId: string;
      let code: string;
      let userId: string | null;
      const matched = found.rows.length > 0;
      if (matched) {
        ({ id: childId, code, user_id: userId } = found.rows[0]);
      } else {
        const ins = await client.query<{ id: string; code: string }>(
          'INSERT INTO children (full_name, name_key) VALUES ($1, $2) RETURNING id, code',
          [row.full_name, key],
        );
        ({ id: childId, code } = ins.rows[0]);
        userId = null;
      }

      await client.query(
        'UPDATE children SET full_name = $1, base_category = $2, sparks = $3 WHERE id = $4',
        [row.full_name, row.category, row.sparks, childId],
      );
      await client.query(
        'INSERT INTO list_members (list_id, child_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [listId, childId],
      );

      const hash = hashes[i];
      let login: string;
      if (userId) {
        const userRes = await client.query<{ email: string }>(
          'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email',
          [hash, userId],
        );
        login = userRes.rows[0].email;
      } else {
        let userRes;
        try {
          userRes = await client.query<{ id: string }>(
            `INSERT INTO users (email, username, password_hash, full_name)
             VALUES ($1, $1, $2, $3) RETURNING id`,
            [row.login, hash, row.full_name],
          );
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, `Логин «${row.login}» (${row.full_name}) уже занят другим аккаунтом`);
          }
          throw err;
        }
        await client.query('UPDATE children SET user_id = $1 WHERE id = $2', [userRes.rows[0].id, childId]);
        login = row.login;
      }
      await client.query(
        'UPDATE children SET issued_password = $1 WHERE id = $2',
        [encryptSecret(row.password), childId],
      );

      entries.push({
        full_name: row.full_name,
        code,
        matched,
        category: row.category,
        sparks: row.sparks,
        login,
        sheet_login: row.login,
        password: row.password,
        account: userId ? 'password_updated' : 'created',
      });
    }

    // Resync categories of an already-prepared distribution (undistributed only).
    const resync = await client.query(
      `UPDATE season_participants sp
          SET category = c.base_category
         FROM children c, seasons s
        WHERE sp.child_id = c.id
          AND sp.season_id = s.id
          AND s.status = 'active'
          AND sp.team_id IS NULL
          AND c.base_category IS NOT NULL
          AND sp.category <> c.base_category`,
    );

    const result: RosterImportResult = {
      applied: apply,
      list_name: listRes.rows[0].name,
      created: entries.filter((e) => !e.matched).length,
      matched: entries.filter((e) => e.matched).length,
      accounts_created: entries.filter((e) => e.account === 'created').length,
      passwords_updated: entries.filter((e) => e.account === 'password_updated').length,
      resynced: resync.rowCount ?? 0,
      entries,
    };

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Look up a list by exact name (CLI convenience). */
export async function findListByName(name: string): Promise<string | null> {
  const found = await pool.query<{ id: string }>(
    'SELECT id FROM children_lists WHERE name = $1',
    [name],
  );
  return found.rows[0]?.id ?? null;
}

/** Look up a list by exact name, creating it when missing (CLI convenience). */
export async function ensureListByName(name: string): Promise<{ id: string; created: boolean }> {
  const found = await findListByName(name);
  if (found) return { id: found, created: false };
  const ins = await pool.query<{ id: string }>(
    'INSERT INTO children_lists (name) VALUES ($1) RETURNING id',
    [name],
  );
  return { id: ins.rows[0].id, created: true };
}
