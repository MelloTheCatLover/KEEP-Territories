import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button, ErrorBanner, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  importRoster, type ParticipantCategory, type RosterImportResult,
} from './children-lists-api';
import { readXlsx, toTsv } from './xlsx';

const CATEGORY_LABEL: Record<ParticipantCategory, string> = {
  mvp: 'МВП',
  winner: 'Победитель',
  participant: 'Участник',
  newbie: 'Новенький',
};

const CATEGORY_ORDER: ParticipantCategory[] = ['mvp', 'winner', 'participant', 'newbie'];

/**
 * Upload of the counselor's shift spreadsheet into a list: children are created
 * or matched by ФИО, their КТП becomes the starting category, and the logins and
 * passwords from the sheet become real accounts. Always previewed first — the
 * server runs the whole import and rolls it back until "Применить".
 */
export function RosterImport({
  listId,
  listName,
  onApplied,
}: {
  listId: string;
  listName: string;
  onApplied: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(source: string, apply: boolean) {
    setBusy(apply ? 'apply' : 'preview');
    setError(null);
    try {
      const res = await importRoster(listId, source, apply);
      setResult(res);
      if (apply) onApplied();
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Не удалось разобрать таблицу');
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const source = /\.xlsx$/i.test(file.name) ? toTsv(await readXlsx(file)) : await file.text();
      setText(source);
      setFileName(file.name);
      await run(source, false);
    } catch (err) {
      setFileName(null);
      setError(err instanceof Error ? err.message : 'Не удалось прочитать файл');
    }
  }

  function reset() {
    setText('');
    setFileName(null);
    setResult(null);
    setError(null);
  }

  const counts = result
    ? CATEGORY_ORDER.map((cat) => ({
        cat,
        n: result.entries.filter((e) => e.category === cat).length,
      })).filter((c) => c.n > 0)
    : [];
  const mismatched = result?.entries.filter((e) => e.login !== e.sheet_login) ?? [];

  return (
    <div className="border-t border-neutral-300 pt-4 mt-4">
      <Label htmlFor="roster-file">Загрузить таблицу смены</Label>
      <p className="text-xs text-neutral-700 mb-2">
        Колонки: ФИО, Искры, КТП, КТБ, Логин, Пароль. Файл .xlsx или .csv — либо
        вставьте строки прямо из Excel. Дети заводятся или находятся по ФИО, КТП
        становится стартовой категорией распределения, логин и пароль из таблицы
        превращаются в аккаунт.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <input
          id="roster-file"
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => void handleFile(e)}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          <span className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Выбрать файл</span>
        </Button>
        {fileName && <span className="text-xs font-mono text-neutral-700 truncate min-w-0">{fileName}</span>}
      </div>

      <textarea
        className="w-full h-24 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000 font-mono"
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); setFileName(null); }}
        placeholder={'ФИО\tИскры\tКТП\tКТБ\tЛогин\tПароль'}
        disabled={busy !== null}
      />

      <div className="flex flex-wrap items-center gap-3 mt-2">
        <Button
          variant="secondary"
          onClick={() => void run(text, false)}
          isLoading={busy === 'preview'}
          disabled={!text.trim() || busy !== null}
        >
          <span className="flex items-center gap-2"><Upload className="w-4 h-4" />Проверить</span>
        </Button>
        {result && !result.applied && (
          <Button
            variant="primary"
            onClick={() => {
              if (confirm(`Импортировать ${result.entries.length} детей в «${listName}»? Пароли будут перезаписаны на значения из таблицы.`)) {
                void run(text, true);
              }
            }}
            isLoading={busy === 'apply'}
            disabled={busy !== null}
          >
            Применить
          </Button>
        )}
        {result?.applied && (
          <>
            <Button variant="secondary" onClick={() => exportCredentials(listName, result)}>
              <span className="flex items-center gap-2"><Download className="w-4 h-4" />Логины CSV</span>
            </Button>
            <Button variant="secondary" onClick={reset}>Готово</Button>
          </>
        )}
        {busy === 'apply' && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
      </div>

      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}

      {result && (
        <div className="mt-3 text-sm bg-neutral-200 border border-neutral-400 rounded-sm p-3">
          <div className="text-neutral-1000">
            {result.applied ? 'Импортировано' : 'Предпросмотр'}: {result.entries.length} детей —{' '}
            {result.created} новых, {result.matched} уже были.
          </div>
          <div className="text-neutral-700 mt-0.5">
            Аккаунтов {result.applied ? 'создано' : 'будет создано'}: {result.accounts_created},{' '}
            паролей {result.applied ? 'обновлено' : 'будет обновлено'}: {result.passwords_updated}
            {result.resynced > 0 && <> · категорий в активном сезоне: {result.resynced}</>}
          </div>
          <div className="text-neutral-700 mt-0.5">
            КТП: {counts.map((c) => `${CATEGORY_LABEL[c.cat]} — ${c.n}`).join(', ')}
          </div>
          {mismatched.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-warning">
              {mismatched.map((e) => (
                <li key={e.code}>
                  {e.full_name}: аккаунт уже был под логином{' '}
                  <span className="font-mono">{e.login}</span>, в таблице{' '}
                  <span className="font-mono">{e.sheet_login}</span> — пароль обновлён, логин прежний
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportCredentials(listName: string, result: RosterImportResult): void {
  const header = ['ФИО', 'Код', 'Логин', 'Пароль', 'КТП', 'Искры'];
  const rows = result.entries.map((e) =>
    [e.full_name, e.code, e.login, e.password, CATEGORY_LABEL[e.category], String(e.sparks)]
      .map(csvCell)
      .join(';'),
  );
  const csv = '﻿' + [header.map(csvCell).join(';'), ...rows].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${listName.replace(/[^\p{L}\p{N}_-]+/gu, '_')}-логины.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
