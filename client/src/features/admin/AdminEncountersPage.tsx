import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Dices, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  getEncounterPool,
  getPendingEncounters,
  resolveEncounter,
  setEncounterActive,
  type EncounterInstance,
  type EncounterPoolRow,
} from './encounters-api';

export function AdminEncountersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [pending, setPending] = useState<EncounterInstance[]>([]);
  const [pool, setPool] = useState<EncounterPoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function toggle(row: EncounterPoolRow) {
    try {
      const updated = await setEncounterActive(row.number, !row.active);
      setPool((prev) => prev.map((r) => (r.number === updated.number ? updated : r)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось изменить встречу');
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <Dices className="w-6 h-6 text-brand-400" />
          <h1 className="font-display text-heading-md text-neutral-1000">Случайные встречи</h1>
        </div>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>
      <p className="text-sm text-neutral-700 mb-5">
        Выпадают при начале захвата сектора. Разреши встречу — эффект применится к команде.
      </p>

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

          <Card>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Пул встреч</h2>
            <p className="text-xs text-neutral-700 mb-3">Отключённые не выпадают при захвате.</p>
            <ul className="divide-y divide-neutral-200">
              {pool.map((row) => (
                <li key={row.number} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-2xs text-neutral-600 w-6 flex-shrink-0">{row.number}</span>
                  <span className={`flex-1 text-sm ${row.active ? 'text-neutral-1000' : 'text-neutral-500 line-through'}`}>
                    {row.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(row)}
                    className={`px-2 py-1 rounded-sm text-2xs uppercase tracking-wider border flex-shrink-0 ${
                      row.active
                        ? 'border-success text-success-text'
                        : 'border-neutral-400 text-neutral-600'
                    }`}
                  >
                    {row.active ? 'Активна' : 'Выкл'}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
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
      <p className="text-sm text-neutral-900 mb-2">{ev.title}</p>

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
