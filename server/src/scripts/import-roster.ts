/**
 * Import a shift roster from the counselor's spreadsheet (exported to CSV) —
 * the CLI twin of the admin panel's "Загрузить таблицу" on a children list.
 * Parsing and writing live in roster-import.service; this only reads the file
 * and prints the plan.
 *
 * Columns (by header, order-independent): ФИО, Искры, КТП, КТБ, Логин, Пароль.
 *
 * Usage:
 *   npx ts-node src/scripts/import-roster.ts --file roster.csv --list 128 [--apply]
 * Without --apply nothing is written — it prints the plan.
 */
import fs from 'fs';
import { pool } from '../config/db';
import '../config/env';
import { CATEGORY_ORDER } from '../types/distribution';
import {
  parseRoster, importRoster, ensureListByName, findListByName,
} from '../services/roster-import.service';

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
  const rows = parseRoster(fs.readFileSync(args.file, 'utf8'));

  console.log(`Файл: ${rows.length} детей, список «${args.list}»`);
  for (const cat of CATEGORY_ORDER) {
    console.log(`  ${cat}: ${rows.filter((r) => r.category === cat).length}`);
  }

  // A dry run must not leave a list behind, so an absent list is only reported.
  const existing = await findListByName(args.list);
  if (!existing && !args.apply) {
    console.log(`Списка «${args.list}» нет — будет создан при запуске с --apply.`);
    return;
  }
  const listId = existing ?? (await ensureListByName(args.list)).id;
  if (!existing) console.log(`Список «${args.list}» создан`);

  const result = await importRoster(listId, rows, args.apply);
  console.log(
    `Дети: создано ${result.created}, найдено ${result.matched}. ` +
    `Аккаунты: создано ${result.accounts_created}, паролей обновлено ${result.passwords_updated}. ` +
    `Категорий пересинхронизировано в активном сезоне: ${result.resynced}`,
  );
  for (const e of result.entries.filter((e) => e.login !== e.sheet_login)) {
    console.log(`  ! ${e.full_name}: логин в системе «${e.login}», в таблице «${e.sheet_login}»`);
  }
  console.log(args.apply ? 'Применено.' : 'Пробный прогон — ничего не записано. Повторите с --apply.');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  });
