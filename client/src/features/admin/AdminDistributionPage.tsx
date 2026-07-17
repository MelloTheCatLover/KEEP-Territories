import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Play, RefreshCw, RotateCcw, Sparkles, Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { DistributionWheel, type WheelItem } from './DistributionWheel';
import {
  getDistribution, prepareDistribution, resetDistribution,
  setParticipantCategory, spinDistribution,
  CATEGORY_ORDER, CATEGORY_LABEL,
  type DistributionState, type ParticipantCategory, type SpinAssignment, type SpinResult,
} from './distribution-api';
import { AccessDenied, AdminPageHeader } from './AdminShell';

export function AdminDistributionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<DistributionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [preparing, setPreparing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const [batchSize, setBatchSize] = useState(4);
  const [durationSec, setDurationSec] = useState(4);

  const [spinToken, setSpinToken] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [pending, setPending] = useState<SpinResult | null>(null);
  const [lastAssigned, setLastAssigned] = useState<SpinAssignment[] | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await getDistribution());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить распределение');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  // Current category being dealt and its remaining (pre-spin) pool.
  const { currentCategory, pool } = useMemo(() => {
    if (!state) return { currentCategory: null as ParticipantCategory | null, pool: [] as WheelItem[] };
    let cat: ParticipantCategory | null = null;
    for (const c of CATEGORY_ORDER) {
      const cc = state.category_counts[c];
      if (cc.total - cc.assigned > 0) { cat = c; break; }
    }
    const items: WheelItem[] = cat
      ? state.participants
          .filter((p) => p.category === cat && p.team_id === null)
          .map((p) => ({ id: p.child_id, label: p.full_name }))
      : [];
    return { currentCategory: cat, pool: items };
  }, [state]);

  async function handlePrepare() {
    setPreparing(true);
    setActionError(null);
    try {
      setState(await prepareDistribution());
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось подготовить');
    } finally {
      setPreparing(false);
    }
  }

  async function handleReset() {
    if (!confirm('Сбросить распределение? Команды этого сезона будут удалены, участники откреплены.')) return;
    setResetting(true);
    setActionError(null);
    try {
      const next = await resetDistribution();
      setState(next);
      setLastAssigned(null);
      setPending(null);
      setWinnerId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка сброса');
    } finally {
      setResetting(false);
    }
  }

  async function handleSpin() {
    if (spinning) return;
    setSpinning(true);
    setActionError(null);
    setLastAssigned(null);
    try {
      const result = await spinDistribution(batchSize);
      if (result.assigned.length === 0) {
        setState(result.state);
        setSpinning(false);
        return;
      }
      // Keep pre-spin state on screen; reveal after the wheel lands.
      setPending(result);
      setWinnerId(result.assigned[0].child_id);
      setSpinToken((t) => t + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка прокрута');
      setSpinning(false);
    }
  }

  function handleWheelDone() {
    if (pending) {
      setState(pending.state);
      setLastAssigned(pending.assigned);
      setPending(null);
    }
    setSpinning(false);
  }

  async function handleCategory(childId: string, category: ParticipantCategory) {
    setActionError(null);
    try {
      setState(await setParticipantCategory(childId, category));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось изменить категорию');
    }
  }

  if (!isAdmin) return <AccessDenied />;

  const noMap = state !== null && state.home_base_count === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <AdminPageHeader
        title="Распределение команд"
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4" />Обновить</span>
          </Button>
        }
      />

      {loadError && <ErrorBanner message={loadError} />}
      {actionError && <ErrorBanner message={actionError} />}

      {state === null ? (
        <Loading />
      ) : noMap ? (
        <Card>
          <p className="text-sm text-neutral-700">
            На карте сезона «{state.season_name}» нет домашних баз. Сначала сгенерируйте карту.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-neutral-700">
                Сезон <span className="text-neutral-1000">{state.season_name}</span> ·{' '}
                баз: <span className="text-neutral-1000">{state.home_base_count}</span> ·{' '}
                команд: <span className="text-neutral-1000">{state.team_count}</span> ·{' '}
                участников: <span className="text-neutral-1000">{state.participants.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => void handlePrepare()} isLoading={preparing}>
                  <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />
                    {state.prepared ? 'Досоздать команды' : 'Подготовить'}
                  </span>
                </Button>
                {state.prepared && (
                  <Button variant="danger" onClick={() => void handleReset()} isLoading={resetting}>
                    <span className="flex items-center gap-2"><RotateCcw className="w-4 h-4" />Сбросить</span>
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {!state.prepared ? (
            <Card>
              <p className="text-sm text-neutral-700">
                Нажмите «Подготовить»: создадутся {state.home_base_count} пустых команд (по числу баз),
                а дети сезона получат категорию по истории. Потом можно править категории и крутить колесо.
              </p>
            </Card>
          ) : (
            <>
              {/* Progress per category */}
              <Card>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CATEGORY_ORDER.map((c) => {
                    const cc = state.category_counts[c];
                    return (
                      <div key={c} className="rounded-sm border border-neutral-400 px-3 py-2">
                        <div className="text-xs text-neutral-700 uppercase tracking-wide">{CATEGORY_LABEL[c]}</div>
                        <div className="font-mono text-lg text-neutral-1000">{cc.assigned}/{cc.total}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Wheel */}
              <Card>
                {state.done ? (
                  <div className="text-center py-6">
                    <Sparkles className="w-8 h-8 text-brand-400 mx-auto mb-2" />
                    <p className="text-neutral-1000 font-display text-heading-sm">Распределение завершено</p>
                    <p className="text-sm text-neutral-700 mt-1">Все участники в командах.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-4 mb-4">
                      <div>
                        <Label htmlFor="batch">За раз</Label>
                        <input
                          id="batch"
                          type="number"
                          min={1}
                          max={50}
                          value={batchSize}
                          onChange={(e) => setBatchSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                          disabled={spinning}
                          className="w-24 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dur">Время прокрутки, сек</Label>
                        <input
                          id="dur"
                          type="number"
                          min={1}
                          max={15}
                          value={durationSec}
                          onChange={(e) => setDurationSec(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                          disabled={spinning}
                          className="w-24 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000"
                        />
                      </div>
                      <div className="flex-1" />
                      <div className="text-sm text-neutral-700">
                        Категория:{' '}
                        <span className="text-neutral-1000">
                          {currentCategory ? CATEGORY_LABEL[currentCategory] : '—'}
                        </span>
                      </div>
                    </div>

                    <DistributionWheel
                      pool={pool}
                      winnerId={winnerId}
                      spinToken={spinToken}
                      durationMs={durationSec * 1000}
                      onDone={handleWheelDone}
                    />

                    <div className="flex justify-center mt-4">
                      <Button variant="primary" onClick={() => void handleSpin()} isLoading={spinning} disabled={pool.length === 0}>
                        <span className="flex items-center gap-2"><Play className="w-4 h-4" />Крутить</span>
                      </Button>
                    </div>
                  </>
                )}

                {lastAssigned && lastAssigned.length > 0 && (
                  <div className="mt-4 text-sm bg-neutral-200 border border-neutral-400 rounded-sm p-3">
                    <div className="text-neutral-700 mb-1">Выпали:</div>
                    <ul className="space-y-0.5">
                      {lastAssigned.map((a) => (
                        <li key={a.child_id} className="text-neutral-1000">
                          {a.full_name} → <span className="text-brand-400">{a.team_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Teams */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-neutral-800" />
                  <h2 className="font-display text-heading-sm text-neutral-1000">Команды</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {state.teams.map((t) => {
                    const members = state.participants.filter((p) => p.team_id === t.id);
                    return (
                      <Card key={t.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                            aria-hidden
                          />
                          <span className="font-display text-neutral-1000">{t.name}</span>
                          <span className="text-xs text-neutral-700">· {members.length}</span>
                        </div>
                        {members.length > 0 ? (
                          <ul className="text-sm text-neutral-800 space-y-0.5">
                            {members.map((m) => (
                              <li key={m.child_id} className="truncate">
                                {m.full_name}
                                {!m.has_account && <span className="text-warning-text text-xs"> · нет аккаунта</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-neutral-700">Пусто</p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Participants with category editing */}
              <section>
                <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">Участники</h2>
                <Card>
                  <ul className="divide-y divide-neutral-300">
                    {state.participants.map((p) => (
                      <li key={p.child_id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <span className="text-sm text-neutral-1000">{p.full_name}</span>
                          <span className="text-xs font-mono text-neutral-700 ml-2">{p.code}</span>
                          {!p.has_account && <span className="text-xs text-warning-text ml-2">нет аккаунта</span>}
                          {p.team_name && <span className="text-xs text-brand-400 ml-2">→ {p.team_name}</span>}
                        </div>
                        <select
                          value={p.category}
                          onChange={(e) => void handleCategory(p.child_id, e.target.value as ParticipantCategory)}
                          disabled={p.team_id !== null || spinning}
                          className="bg-neutral-200 border border-neutral-400 rounded-sm px-2 py-1 text-sm text-neutral-1000 disabled:opacity-50"
                        >
                          {CATEGORY_ORDER.map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-3 text-neutral-700">
      <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      <span>Загрузка...</span>
    </div>
  );
}
