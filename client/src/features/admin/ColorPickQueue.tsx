import { useMemo, useState } from 'react';
import { Check, Palette, Play, RotateCcw } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';
import { DistributionWheel, type WheelItem } from './DistributionWheel';
import {
  pickTeamColor, resetColorPicks, spinColorPick,
  type ColorSpinResult, type DistributionState,
} from './distribution-api';

type Props = {
  state: DistributionState;
  onState: (next: DistributionState) => void;
  durationMs: number;
};

/**
 * Colour queue: once everyone is in a team, the wheel draws a team, that team
 * takes a colour, and the drawn team leaves the wheel. Colours already taken
 * are not offered again.
 */
export function ColorPickQueue({ state, onState, durationMs }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  const [spinToken, setSpinToken] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [pending, setPending] = useState<ColorSpinResult | null>(null);

  const { color_pick: queue, teams } = state;
  const pendingTeam = teams.find((t) => t.id === queue.pending_team_id) ?? null;

  // Teams still in the wheel. Held at the pre-spin set while the wheel turns,
  // so the drawn team is still on screen when the pointer lands on it.
  const pool: WheelItem[] = useMemo(() => {
    const ids = pending
      ? [...queue.remaining_team_ids, pending.team_id]
      : queue.remaining_team_ids;
    return teams.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, label: t.name }));
  }, [teams, queue.remaining_team_ids, pending]);

  const available = useMemo(() => {
    const taken = new Set(queue.taken_colors.map((c) => c.toUpperCase()));
    return TEAM_COLOR_ORDER
      .map((key) => ({ key, ...teamColors[key] }))
      .filter((c) => !taken.has(c.base.toUpperCase()));
  }, [queue.taken_colors]);

  async function handleSpin() {
    if (spinning) return;
    setSpinning(true);
    setError(null);
    try {
      const result = await spinColorPick();
      setPending(result);
      setWinnerId(result.team_id);
      setSpinToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка прокрута');
      setSpinning(false);
    }
  }

  function handleWheelDone() {
    if (pending) {
      onState(pending.state);
      setPending(null);
    }
    setSpinning(false);
  }

  async function handlePick(color: string) {
    if (!pendingTeam || picking) return;
    setPicking(color);
    setError(null);
    try {
      onState(await pickTeamColor(pendingTeam.id, color));
      setWinnerId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выбрать цвет');
    } finally {
      setPicking(null);
    }
  }

  async function handleReset() {
    if (!confirm('Сбросить выбор цветов? Все команды останутся без цвета, очередь начнётся заново.')) return;
    setResetting(true);
    setError(null);
    try {
      onState(await resetColorPicks());
      setWinnerId(null);
      setPending(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сброса');
    } finally {
      setResetting(false);
    }
  }

  const picked = teams
    .filter((t) => t.color !== null)
    .sort((a, b) => (a.color_pick_seq ?? 0) - (b.color_pick_seq ?? 0));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-brand-400" />
          <h2 className="font-display text-heading-sm text-neutral-1000">Выбор цветов</h2>
          <span className="text-sm text-neutral-700">
            {picked.length}/{teams.length}
          </span>
        </div>
        {picked.length > 0 && (
          <Button variant="secondary" onClick={() => void handleReset()} isLoading={resetting}>
            <span className="flex items-center gap-2"><RotateCcw className="w-4 h-4" />Сбросить цвета</span>
          </Button>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {queue.done ? (
        <div className="text-center py-6">
          <Check className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-neutral-1000 font-display text-heading-sm">Цвета разобраны</p>
          <p className="text-sm text-neutral-700 mt-1">Все команды выбрали цвет.</p>
        </div>
      ) : pendingTeam && !spinning ? (
        <div>
          <p className="text-center text-sm text-neutral-700 mb-1">Выбирает</p>
          <p className="text-center font-display text-heading-sm text-brand-400 mb-4">
            {pendingTeam.name}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {available.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => void handlePick(c.base)}
                disabled={picking !== null}
                className="rounded-sm border border-neutral-400 p-3 flex flex-col items-center gap-2
                           transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
                style={{ backgroundColor: c.muted }}
              >
                <span
                  className="w-10 h-10 rounded-full border-2 border-neutral-1000/30"
                  style={{ backgroundColor: c.base }}
                  aria-hidden
                />
                <span className="text-xs" style={{ color: c.textOnBase }}>
                  {picking === c.base ? 'Выбираем…' : c.base}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <DistributionWheel
            pool={pool}
            winnerId={winnerId}
            spinToken={spinToken}
            durationMs={durationMs}
            onDone={handleWheelDone}
          />
          <div className="flex justify-center mt-4">
            <Button
              variant="primary"
              onClick={() => void handleSpin()}
              isLoading={spinning}
              disabled={pool.length === 0}
            >
              <span className="flex items-center gap-2"><Play className="w-4 h-4" />Чья очередь</span>
            </Button>
          </div>
        </>
      )}

      {picked.length > 0 && (
        <ul className="mt-4 text-sm bg-neutral-200 border border-neutral-400 rounded-sm p-3 space-y-1">
          {picked.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-neutral-1000">
              <span className="text-neutral-700 font-mono text-xs w-5">{t.color_pick_seq}.</span>
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: t.color ?? undefined }}
                aria-hidden
              />
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
