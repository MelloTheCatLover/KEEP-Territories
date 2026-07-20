/**
 * Import a shift roster from the counselor's spreadsheet (exported to CSV).
 *
 * Columns (by header, order-independent): ФИО, Искры, КТП, КТБ, Логин, Пароль.
 * КТП is the prior standing that drives the start-of-season distribution; it is
 * stored on children.base_category so prepare() can use it (see migration 058).
 *
 * For each row:
 *   - child is matched by surname + given name, created if missing;
 *   - base_category / sparks are overwritten from the sheet;
 *   - the child joins the target list;
 *   - password is set to the sheet's value (hash + encrypted copy for lookup).
 *     An existing account keeps its login; a child without one gets an account
 *     with the login printed in the sheet, so the handout stays correct.
 *
 * Finally, categories of the active season's already-prepared participants are
 * resynced (only those not yet distributed to a team).
 *
 * Usage:
 *   npx ts-node src/scripts/import-roster.ts --file roster.csv --list 128 [--apply]
 * Without --apply nothing is written — it prints the plan.
 */
import bcrypt from 'bcrypt';
import fs from 'fs';
import { pool } from '../config/db';
import '../config/env';
import { encryptSecret } from '../config/crypto';
import { ParticipantCategory, CATEGORY_ORDER } from '../types/distribution';

const SALT_ROUNDS = 12;

/** Sheet wording → system category. Unlisted wording is rejected loudly. */
const CATEGORY_BY_LABEL: Record<string, ParticipantCategory> = {
  'МВП': 'mvp',
  'Лучший в команде': 'mvp',
  'Победитель': 'winner',
  'Участник': 'participant',
  'Новенький': 'newbie',
};

interface Row {
  full_name: string;
  sparks: number;
  category: ParticipantCategory;
  login: string;
  password: string;
}

// ── CSV ────────────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
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
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function readRows(file: string): Row[] {
  const table = parseCsv(fs.readFileSync(file, 'utf8'));
  if (table.length < 2) throw new Error('CSV пуст или содержит только заголовок');
  const header = table[0].map((h) => h.trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`В CSV нет колонки «${name}». Заголовок: ${header.join(', ')}`);
    return i;
  };
  const [iName, iSparks, iCat, iLogin, iPwd] = ['ФИО', 'Искры', 'КТП', 'Логин', 'Пароль'].map(col);

  return table.slice(1).map((cells, n) => {
    const line = n + 2;
    const full_name = (cells[iName] ?? '').trim();
    if (!full_name) throw new Error(`Строка ${line}: пустое ФИО`);
    const label = (cells[iCat] ?? '').trim();
    const category = CATEGORY_BY_LABEL[label];
    if (!category) throw new Error(`Строка ${line}: неизвестный статус КТП «${label}»`);
    const password = (cells[iPwd] ?? '').trim();
    if (password.length < 6) throw new Error(`Строка ${line}: пароль короче 6 символов`);
    const login = (cells[iLogin] ?? '').trim();
    if (!login) throw new Error(`Строка ${line}: пустой логин`);
    return { full_name, sparks: Number((cells[iSparks] ?? '0').trim()) || 0, category, login, password };
  });
}

// ── Name matching (same rules as children-list.service) ────────────────────

function nameKey(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ').toLowerCase();
}

// ── Import ─────────────────────────────────────────────────────────────────

interface Args {
  file: string;
  list: string;
  apply: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const file = get('--file');
  const list = get('--list');
  if (!file || !list) {
    throw new Error('Использование: --file <roster.csv> --list <название списка> [--apply]');
  }
  return { file, list, apply: argv.includes('--apply') };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rows = readRows(args.file);

  const dupes = rows
    .map((r) => nameKey(r.full_name))
    .filter((k, i, all) => all.indexOf(k) !== i);
  if (dupes.length > 0) throw new Error(`В файле повторяются дети: ${[...new Set(dupes)].join(', ')}`);

  console.log(`Файл: ${rows.length} детей, список «${args.list}»`);
  for (const cat of CATEGORY_ORDER) {
    console.log(`  ${cat}: ${rows.filter((r) => r.category === cat).length}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const listRes = await client.query<{ id: string }>(
      'SELECT id FROM children_lists WHERE name = $1',
      [args.list],
    );
    const listId = listRes.rows.length > 0
      ? listRes.rows[0].id
      : (await client.query<{ id: string }>(
          'INSERT INTO children_lists (name) VALUES ($1) RETURNING id', [args.list],
        )).rows[0].id;
    if (listRes.rows.length === 0) console.log(`Список «${args.list}» создан`);

    let created = 0, matched = 0, accountsCreated = 0, passwordsUpdated = 0;

    for (const row of rows) {
      const key = nameKey(row.full_name);
      const found = await client.query<{ id: string; user_id: string | null }>(
        'SELECT id, user_id FROM children WHERE name_key = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
        [key],
      );
      let childId: string;
      let userId: string | null;
      if (found.rows.length > 0) {
        childId = found.rows[0].id;
        userId = found.rows[0].user_id;
        matched++;
      } else {
        const ins = await client.query<{ id: string }>(
          'INSERT INTO children (full_name, name_key) VALUES ($1, $2) RETURNING id',
          [row.full_name, key],
        );
        childId = ins.rows[0].id;
        userId = null;
        created++;
      }

      await client.query(
        'UPDATE children SET full_name = $1, base_category = $2, sparks = $3 WHERE id = $4',
        [row.full_name, row.category, row.sparks, childId],
      );
      await client.query(
        'INSERT INTO list_members (list_id, child_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [listId, childId],
      );

      const hash = await bcrypt.hash(row.password, SALT_ROUNDS);
      if (userId) {
        await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        passwordsUpdated++;
      } else {
        const userRes = await client.query<{ id: string }>(
          `INSERT INTO users (email, username, password_hash, full_name)
           VALUES ($1, $1, $2, $3) RETURNING id`,
          [row.login, hash, row.full_name],
        );
        await client.query('UPDATE children SET user_id = $1 WHERE id = $2', [userRes.rows[0].id, childId]);
        accountsCreated++;
      }
      await client.query(
        'UPDATE children SET issued_password = $1 WHERE id = $2',
        [encryptSecret(row.password), childId],
      );
    }

    // Resync categories of an already-prepared distribution (undistributed only).
    const resync = await client.query<{ n: string }>(
      `UPDATE season_participants sp
          SET category = c.base_category
         FROM children c, seasons s
        WHERE sp.child_id = c.id
          AND sp.season_id = s.id
          AND s.status = 'active'
          AND sp.team_id IS NULL
          AND c.base_category IS NOT NULL
          AND sp.category <> c.base_category
       RETURNING 1`,
    );

    console.log(
      `Дети: создано ${created}, найдено ${matched}. ` +
      `Аккаунты: создано ${accountsCreated}, паролей обновлено ${passwordsUpdated}. ` +
      `Категорий пересинхронизировано в активном сезоне: ${resync.rowCount}`,
    );

    if (args.apply) {
      await client.query('COMMIT');
      console.log('Применено.');
    } else {
      await client.query('ROLLBACK');
      console.log('Пробный прогон — ничего не записано. Повторите с --apply.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  });
