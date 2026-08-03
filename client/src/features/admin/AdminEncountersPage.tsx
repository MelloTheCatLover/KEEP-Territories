import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError, api } from '../../shared/api/client';
import {
  getEncounterPool,
  getPendingEncounters,
  resolveEncounter,
  setEncounterActive,
  setEncounterTarget,
  syncRosterChecks,
  type EncounterInstance,
  type EncounterPoolRow,
} from './encounters-api';
import { AccessDenied, AdminPageHeader } from './AdminShell';

interface TeamOption {
  id: string;
  name: string;
}

export function AdminEncountersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [pending, setPending] = useState<EncounterInstance[]>([]);
  const [pool, setPool] = useState<EncounterPoolRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, pl] = await Promise.all([getPendingEncounters(), getEncounterPool()]);
      setPending(p.instances);
      setPool(pl.encounters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить встречи');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<TeamOption[]>('/teams')
      .then((rows) => setTeams(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setTeams([]));
  }, [isAdmin]);

  async function bindTarget(row: EncounterPoolRow, teamId: string | null) {
    try {
      const updated = await setEncounterTarget(row.number, teamId);
      setPool((prev) => prev.map((r) => (r.number === updated.number ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось привязать команду');
    }
  }

  async function resolve(inst: EncounterInstance, choice?: string) {
    setBusyId(inst.id);
    setError(null);
    try {
      await resolveEncounter(inst.id, choice);
      setPending((prev) => prev.filter((i) => i.id !== inst.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось разрешить встречу');
    } finally {
      setBusyId(null);
    }
  }

  async function syncChecks() {
    setSyncing(true);
    setError(null);
    try {
      const res = await syncRosterChecks();
      setPool(res.encounters);
      setSyncNotice(
        `Проверок по составу: ${res.teams}` +
          (res.withoutChampion.length > 0
            ? ` · без победителей и МВП в реестре: ${res.withoutChampion.join(', ')} (подставлен капитан)`
            : ''),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось пересобрать проверки');
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(row: EncounterPoolRow) {
    try {
      const updated = await setEncounterActive(row.number, !row.active);
      setPool((prev) => prev.map((r) => (r.number === updated.number ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось изменить встречу');
    }
  }

  const rosterRows = useMemo(() => pool.filter((r) => r.kind === 'roster'), [pool]);
  const negativeRows = useMemo(
    () => pool.filter((r) => r.kind === 'standard' && r.polarity === 'negative'),
    [pool],
  );
  const positiveRows = useMemo(
    () => pool.filter((r) => r.kind === 'standard' && r.polarity === 'positive'),
    [pool],
  );

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="max-w-3xl mx-auto px-4">
      <AdminPageHeader
        title="Случайные встречи"
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">
              Ожидают разрешения {pending.length > 0 && <span className="text-brand-400">({pending.length})</span>}
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-neutral-700 py-2">Нет активных встреч.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((inst) => (
                  <PendingCard key={inst.id} inst={inst} busy={busyId === inst.id} onResolve={resolve} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="font-display text-heading-sm text-neutral-1000">Проверки по составу</h2>
              <Button type="button" variant="secondary" onClick={syncChecks} disabled={syncing}>
                <Users className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
                Пересобрать по командам
              </Button>
            </div>
            <p className="text-xs text-neutral-700 mb-3">
              По одной встрече на команду. В вопросе называется участник этой команды, который уже
              побеждал или был МВП; угадавшая команда получает бонус.
            </p>
            {syncNotice && <p className="text-xs text-brand-400 mb-2">{syncNotice}</p>}
            {rosterRows.length === 0 ? (
              <p className="text-sm text-neutral-700 py-1">
                Проверок ещё нет — нажмите «Пересобрать по командам».
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {rosterRows.map((row) => (
                  <PoolItem key={row.number} row={row} teams={teams} onToggle={toggle} onBind={bindTarget} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
              Пул встреч{' '}
              <span className="text-xs font-sans text-neutral-700">
                ({negativeRows.length} негативных / {positiveRows.length} позитивных)
              </span>
            </h2>
            <p className="text-xs text-neutral-700 mb-3">Отключённые не выпадают при захвате.</p>
            <PoolGroup title="Негативные" rows={negativeRows} teams={teams} onToggle={toggle} onBind={bindTarget} />
            <PoolGroup title="Позитивные" rows={positiveRows} teams={teams} onToggle={toggle} onBind={bindTarget} />
          </Card>
        </>
      )}
    </div>
  );
}

type PoolItemProps = {
  row: EncounterPoolRow;
  teams: TeamOption[];
  onToggle: (row: EncounterPoolRow) => void;
  onBind: (row: EncounterPoolRow, teamId: string | null) => void;
};

function PoolGroup({
  title,
  rows,
  ...rest
}: Omit<PoolItemProps, 'row'> & { title: string; rows: EncounterPoolRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-2xs uppercase tracking-wider text-neutral-700 mb-1">
        {title} · {rows.length}
      </h3>
      <ul className="divide-y divide-neutral-200">
        {rows.map((row) => (
          <PoolItem key={row.number} row={row} {...rest} />
        ))}
      </ul>
    </div>
  );
}

function PoolItem({ row, teams, onToggle, onBind }: PoolItemProps) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="font-mono text-2xs text-neutral-600 w-7 flex-shrink-0 mt-0.5">{row.number}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${row.active ? 'text-neutral-1000' : 'text-neutral-500 line-through'}`}>
          {row.title}
        </p>
        <p className="text-xs text-neutral-600 mt-0.5">{row.description}</p>
        {row.supports_target && (
          <>
            <label className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="text-2xs uppercase tracking-wider text-neutral-700">Команда:</span>
              <select
                value={row.target_team_id ?? ''}
                onChange={(e) => onBind(row, e.target.value || null)}
                className="px-2 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-xs focus:outline-none focus:border-brand-500 max-w-[12rem]"
              >
                <option value="">— не привязана —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {row.target_person_name && (
                <span className="text-2xs text-neutral-700">
                  игрок: <span className="text-neutral-1000">{row.target_person_name}</span>
                </span>
              )}
            </label>
            <p className="text-2xs text-neutral-500 italic mt-1">
              Игрокам: «Если в вашей команде есть {row.target_person_name ?? 'загаданный игрок'}, то
              _____.»
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => onToggle(row)}
        className={`px-2 py-1 rounded-sm text-2xs uppercase tracking-wider border flex-shrink-0 ${
          row.active ? 'border-success text-success-text' : 'border-neutral-400 text-neutral-600'
        }`}
      >
        {row.active ? 'Активна' : 'Выкл'}
      </button>
    </li>
  );
}

function PendingCard({
  inst,
  busy,
  onResolve,
}: {
  inst: EncounterInstance;
  busy: boolean;
  onResolve: (inst: EncounterInstance, choice?: string) => void;
}) {
  const ev = inst.eval;
  return (
    <li className="border border-neutral-400 rounded-sm p-3 bg-neutral-100">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xs font-mono text-neutral-600">#{ev.number}</span>
        <span className="text-sm font-medium text-neutral-1000">{inst.team_name ?? '—'}</span>
      </div>
      <p className="text-sm text-neutral-900 mb-1">{ev.title}</p>
      <p className="text-xs text-neutral-600 mb-2 italic">{ev.description}</p>

      {inst.target_person_name && (
        <p className="text-xs text-neutral-700 mb-2">
          Речь об игроке{' '}
          <span className="text-neutral-1000 font-medium">{inst.target_person_name}</span>
          {inst.target_team_name && <> (команда «{inst.target_team_name}»)</>}
        </p>
      )}

      {ev.relevant && (
        <p className="text-xs text-neutral-700 mb-2">
          <span className="uppercase tracking-wider text-2xs">{ev.relevant.label}:</span>{' '}
          <span className="font-mono text-neutral-1000">{ev.relevant.value}</span>
        </p>
      )}

      {ev.choice ? (
        <div>
          <p className="text-xs text-neutral-700 mb-2">{ev.choice.prompt}</p>
          <div className="flex flex-wrap gap-2">
            {ev.choice.options.map((o) => (
              <Button
                key={o.key}
                type="button"
                variant="secondary"
                onClick={() => onResolve(inst, o.key)}
                disabled={busy}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      ) : ev.resolution ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm ${
              ev.resolution.manual ? 'text-warning-text' : 'text-neutral-1000 font-medium'
            }`}
          >
            Исход: {ev.resolution.outcomeText}
          </span>
          <div className="flex-1" />
          <Button type="button" variant="primary" onClick={() => onResolve(inst)} isLoading={busy} disabled={busy}>
            {ev.resolution.manual ? 'Отметить' : 'Применить'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
