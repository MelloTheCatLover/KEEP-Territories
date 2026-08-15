import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Scale, Sparkles, X } from 'lucide-react';
import {
  applyLawEffect,
  cancelLawEffect,
  getLawEffects,
  getWheelCatalog,
  spinWheel,
  type LawEffect,
  type WheelPrizeDef,
} from '../admin/laws-api';
import { FortuneWheelModal } from './FortuneWheelModal';
import { formatSectorLabel, type DifficultySlug, type Sector } from './types';
import type { TeamFullStats } from '../team/types';
import { ApiError } from '../../shared/api/client';

type Props = {
  /** Команда, за которую играет председатель, — она предлагается по умолчанию. */
  activeTeam: TeamFullStats | null;
  teams: TeamFullStats[];
  sectors: Sector[];
  /** Вызывается после вращения/применения — родитель перезагружает карту. */
  onChanged: () => void;
};

/** Потолок укрепления — зеркало MAX_FORTIFICATION на сервере. */
const MAX_FORTIFICATION = 3;

/**
 * Законы съезда, которые председатель включает руками. Пока закон один —
 * «Колесо фортуны»: председатель даёт колесо команде, крутит его сервер, а
 * панель показывает результат и то, что осталось висеть на командах.
 *
 * Мгновенные плюшки уже применены к моменту показа колеса; заряженные ждут
 * своего момента — «мешок цемента» просит сектор здесь, «без очереди» гаснет
 * само, когда председатель разберёт заявку команды.
 */
export function LawPanel({ activeTeam, teams, sectors, onChanged }: Props) {
  const [prizes, setPrizes] = useState<WheelPrizeDef[]>([]);
  const [armed, setArmed] = useState<LawEffect[]>([]);
  const [history, setHistory] = useState<LawEffect[]>([]);
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spun, setSpun] = useState<LawEffect | null>(null);
  const [sectorFor, setSectorFor] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const list = await getLawEffects();
      setArmed(list.armed);
      setHistory(list.history);
    } catch {
      /* панель необязательная — молча переживаем сбой загрузки */
    }
  }, []);

  useEffect(() => {
    getWheelCatalog()
      .then((r) => setPrizes(r.prizes))
      .catch(() => setPrizes([]));
    void reload();
  }, [reload]);

  // Пока председатель не выбрал команду руками, колесо идёт той, за которую он играет.
  useEffect(() => {
    if (!teamId && activeTeam) setTeamId(activeTeam.id);
  }, [activeTeam, teamId]);

  const team = useMemo(
    () => teams.find((t) => t.id === teamId) ?? null,
    [teams, teamId],
  );

  /** Свои неукреплённые до потолка сектора — цели «мешка цемента». */
  const ownSectors = useCallback(
    (ofTeamId: string) =>
      sectors
        .filter(
          (s) =>
            s.captured_by_team_id === ofTeamId &&
            !s.is_home_base &&
            s.fortification_level < MAX_FORTIFICATION,
        )
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [sectors],
  );

  async function spin() {
    if (!team) return;
    setBusy(true);
    setError(null);
    try {
      const result = await spinWheel(team.id);
      setSpun(result);
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось крутануть колесо');
    } finally {
      setBusy(false);
    }
  }

  async function apply(effect: LawEffect) {
    const sectorId = sectorFor[effect.id];
    if (!sectorId) return;
    setBusy(true);
    setError(null);
    try {
      await applyLawEffect(effect.id, sectorId);
      setSectorFor((prev) => ({ ...prev, [effect.id]: '' }));
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось применить плюшку');
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    setBusy(true);
    setError(null);
    try {
      await cancelLawEffect(id);
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось снять плюшку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-sm border border-brand-700/60 bg-brand-900/20 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-brand-700/40">
        <Scale className="w-3.5 h-3.5 text-brand-400" />
        <span className="font-display text-sm text-neutral-1000">Законы</span>
        <span className="ml-auto text-2xs text-neutral-700">колесо фортуны</span>
      </div>

      <div className="p-2 space-y-2 text-xs">
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
        >
          <option value="">— кому даём колесо —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void spin()}
          disabled={!team || busy}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs text-2xs font-medium bg-brand-900/40 text-brand-400 border border-brand-700 hover:bg-brand-900/60 transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Дать колесо фортуны
        </button>

        <p className="text-2xs text-neutral-700">
          Восемь плюшек: мелочь влиянием и опытом, очко апгрейда, жетоны лавок,
          приоритет в очереди сдачи, бесплатное укрепление — и редкий джекпот.
        </p>

        {error && <p className="text-2xs text-danger-text">{error}</p>}

        {armed.length > 0 && (
          <div className="border-t border-neutral-300 pt-2">
            <div className="text-2xs text-neutral-700 mb-1">Заряжено ({armed.length})</div>
            <ul className="space-y-1">
              {armed.map((e) => {
                const targets = ownSectors(e.team_id);
                const needsSector =
                  prizes.find((p) => p.kind === e.kind)?.needs_sector ?? false;
                return (
                  <li
                    key={e.id}
                    className="rounded-xs bg-neutral-0/70 border border-neutral-300 px-2 py-1 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-2xs text-neutral-1000 truncate">{e.title}</div>
                        <div className="text-2xs text-neutral-700 truncate">у {e.team_name}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void drop(e.id)}
                        disabled={busy}
                        title="Снять плюшку"
                        className="flex-shrink-0 p-1 rounded-xs text-neutral-700 hover:text-danger-text disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {needsSector && (
                      <div className="flex gap-1">
                        <select
                          value={sectorFor[e.id] ?? ''}
                          onChange={(ev) =>
                            setSectorFor((prev) => ({ ...prev, [e.id]: ev.target.value }))
                          }
                          className="flex-1 min-w-0 px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
                        >
                          <option value="">— свой сектор —</option>
                          {targets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {formatSectorLabel(
                                s.difficulty.slug as DifficultySlug,
                                s.number,
                              )}{' '}
                              · укр. {s.fortification_level}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void apply(e)}
                          disabled={busy || !sectorFor[e.id]}
                          className="flex-shrink-0 px-2 py-1 rounded-xs text-2xs font-medium bg-brand-900/40 text-brand-400 border border-brand-700 hover:bg-brand-900/60 transition-colors disabled:opacity-50"
                        >
                          Применить
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {history.length > 0 && (
          <details className="border-t border-neutral-300 pt-2">
            <summary className="text-2xs text-neutral-700 cursor-pointer">
              Журнал ({history.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {history.slice(0, 10).map((e) => (
                <li key={e.id} className="text-2xs text-neutral-700">
                  <span className="text-neutral-1000">{e.title}</span> · {e.team_name}
                  {e.sector_number != null && e.sector_difficulty_slug
                    ? ` · ${formatSectorLabel(
                        e.sector_difficulty_slug as DifficultySlug,
                        e.sector_number,
                      )}`
                    : ''}
                  {e.note ? ` — ${e.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {spun && (
        <FortuneWheelModal
          prizes={prizes}
          result={spun}
          teamName={spun.team_name}
          onClose={() => setSpun(null)}
        />
      )}
    </div>
  );
}
