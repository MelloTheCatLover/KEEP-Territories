import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  createCongressLaw,
  deleteCongressLaw,
  getCongressLaws,
  getCongressOverview,
  setCongressLawStatus,
  updateCongressLawText,
  type CongressLaw,
  type CongressTeam,
  type LawStatus,
} from './congress-api';

const VOTES_KEY = 'congress_total_votes';

/** Split `total` votes across teams proportionally to influence (largest remainder). */
function distributeTokens(teams: CongressTeam[], total: number): Map<string, number> {
  const result = new Map<string, number>();
  const sum = teams.reduce((a, t) => a + t.influence, 0);
  if (total <= 0 || sum <= 0) {
    teams.forEach((t) => result.set(t.id, 0));
    return result;
  }
  let assigned = 0;
  const parts = teams.map((t) => {
    const exact = (total * t.influence) / sum;
    const floor = Math.floor(exact);
    assigned += floor;
    return { id: t.id, floor, frac: exact - floor };
  });
  let remainder = total - assigned;
  [...parts]
    .sort((a, b) => b.frac - a.frac)
    .forEach((p) => {
      if (remainder > 0) {
        p.floor += 1;
        remainder--;
      }
    });
  parts.forEach((p) => result.set(p.id, p.floor));
  return result;
}

const STATUS_CARD: Record<LawStatus, string> = {
  pending: 'bg-neutral-100 border-neutral-400',
  accepted: 'bg-success-bg border-success',
  rejected: 'bg-danger-bg border-danger',
};

const STATUS_LABEL: Record<LawStatus, { text: string; cls: string }> = {
  pending: { text: 'На голосовании', cls: 'text-neutral-700' },
  accepted: { text: 'Принят', cls: 'text-success-text' },
  rejected: { text: 'Отклонён', cls: 'text-danger-text' },
};

export function AdminCongressPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [teams, setTeams] = useState<CongressTeam[]>([]);
  const [laws, setLaws] = useState<CongressLaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalVotes, setTotalVotes] = useState<number>(() => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VOTES_KEY) : null;
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  });

  const [newLaw, setNewLaw] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, lw] = await Promise.all([getCongressOverview(), getCongressLaws()]);
      setTeams(ov.teams);
      setLaws(lw.laws);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  function changeVotes(value: string) {
    const n = Number(value);
    const safe = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
    setTotalVotes(safe);
    if (safe > 0) localStorage.setItem(VOTES_KEY, String(safe));
    else localStorage.removeItem(VOTES_KEY);
  }

  const tokens = useMemo(() => distributeTokens(teams, totalVotes), [teams, totalVotes]);
  const totalInfluence = useMemo(() => teams.reduce((a, t) => a + t.influence, 0), [teams]);

  async function handleAddLaw() {
    const text = newLaw.trim();
    if (!text) return;
    setBusyId('new');
    setError(null);
    try {
      const law = await createCongressLaw(text);
      setLaws((prev) => [law, ...prev]);
      setNewLaw('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить закон');
    } finally {
      setBusyId(null);
    }
  }

  async function decide(id: string, status: LawStatus) {
    setBusyId(id);
    setError(null);
    try {
      const law = await setCongressLawStatus(id, status);
      setLaws((prev) => prev.map((l) => (l.id === id ? law : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось обновить закон');
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(law: CongressLaw) {
    setEditingId(law.id);
    setEditText(law.text);
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    setBusyId(id);
    setError(null);
    try {
      const law = await updateCongressLawText(id, text);
      setLaws((prev) => prev.map((l) => (l.id === id ? law : l)));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось изменить закон');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteCongressLaw(id);
      setLaws((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить закон');
    } finally {
      setBusyId(null);
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
    <div className="max-w-4xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Съезды</h1>
      <p className="text-sm text-neutral-700 mb-5">
        Влияние команд, распределение голосов в жетоны и законы съезда.
      </p>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-heading-sm text-neutral-1000">Жетоны команд</h2>
                <p className="text-xs text-neutral-700 mt-0.5">
                  Голоса делятся пропорционально влиянию.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-wider text-neutral-700">
                  Всего голосов
                </span>
                <input
                  type="number"
                  min={0}
                  value={totalVotes || ''}
                  onChange={(e) => changeVotes(e.target.value)}
                  placeholder="0"
                  className="w-32 px-2 py-1.5 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500"
                />
              </label>
            </div>

            {teams.length === 0 ? (
              <p className="text-sm text-neutral-700 py-4">В активном сезоне нет команд.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
                      <th className="text-left font-medium py-2">Команда</th>
                      <th className="text-right font-medium py-2 px-3">Влияние</th>
                      <th className="text-right font-medium py-2">Жетоны</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {teams.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span
                              aria-hidden
                              className="w-3 h-3 rounded-full flex-shrink-0 border border-neutral-400"
                              style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                            />
                            <span className="text-neutral-1000 truncate">{t.name}</span>
                          </span>
                        </td>
                        <td className="text-right font-mono tabular-nums text-neutral-900 py-2 px-3">
                          {t.influence}
                        </td>
                        <td className="text-right font-mono tabular-nums font-semibold text-brand-300 py-2">
                          {tokens.get(t.id) ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-neutral-300 text-neutral-700">
                      <td className="py-2 text-2xs uppercase tracking-wider">Итого</td>
                      <td className="text-right font-mono tabular-nums py-2 px-3">{totalInfluence}</td>
                      <td className="text-right font-mono tabular-nums py-2">{totalVotes || 0}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">Законы</h2>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <textarea
                value={newLaw}
                onChange={(e) => setNewLaw(e.target.value)}
                placeholder="Текст закона…"
                rows={2}
                className="flex-1 px-3 py-2 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-sm resize-y focus:outline-none focus:border-brand-500"
              />
              <Button
                type="button"
                variant="primary"
                onClick={handleAddLaw}
                disabled={busyId === 'new' || newLaw.trim().length === 0}
                isLoading={busyId === 'new'}
              >
                <Plus className="w-4 h-4" />
                Добавить
              </Button>
            </div>

            {laws.length === 0 ? (
              <p className="text-sm text-neutral-700 py-2">Законов пока нет.</p>
            ) : (
              <ul className="space-y-2">
                {laws.map((law) => {
                  const busy = busyId === law.id;
                  const label = STATUS_LABEL[law.status];
                  if (editingId === law.id) {
                    return (
                      <li
                        key={law.id}
                        className={`border rounded-sm p-3 ${STATUS_CARD[law.status]}`}
                      >
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="w-full px-3 py-2 mb-2 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-sm resize-y focus:outline-none focus:border-brand-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditText('');
                            }}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-neutral-400 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(law.id)}
                            disabled={busy || editText.trim().length === 0}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-success text-success-text hover:bg-success-bg disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Сохранить
                          </button>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={law.id}
                      className={`border rounded-sm p-3 ${STATUS_CARD[law.status]}`}
                    >
                      <p className="text-sm text-neutral-1000 whitespace-pre-wrap break-words mb-2">
                        {law.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-2xs uppercase tracking-wider font-medium ${label.cls}`}>
                          {label.text}
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => startEdit(law)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-neutral-400 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Изменить
                        </button>
                        {law.status !== 'accepted' && (
                          <button
                            type="button"
                            onClick={() => decide(law.id, 'accepted')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-success text-success-text hover:bg-success-bg disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Принять
                          </button>
                        )}
                        {law.status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => decide(law.id, 'rejected')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-danger text-danger-text hover:bg-danger-bg disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Отклонить
                          </button>
                        )}
                        {law.status !== 'pending' && (
                          <button
                            type="button"
                            onClick={() => decide(law.id, 'pending')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-neutral-400 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Сбросить
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => remove(law.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border border-neutral-400 text-neutral-700 hover:bg-danger-bg hover:text-danger-text hover:border-danger disabled:opacity-50"
                          aria-label="Удалить закон"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
