import { useMemo, useState } from 'react';
import { X, Trophy, Sparkles } from 'lucide-react';
import { Button, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import type { Sector } from './types';
import { captureSpecialSector, type SpecialPlaceAssignment } from './api';

export type SpecialTeamOption = { id: string; name: string; color: string | null };

type Props = {
  sector: Sector;
  teams: SpecialTeamOption[];
  onCancel: () => void;
  onDone: () => void;
};

/** Fixed reward bundle per place — mirrors SPECIAL_PLACE_REWARDS on the server. */
const PLACE_REWARDS: Record<number, { influence: number; experience: number }> = {
  1: { influence: 14, experience: 450 },
  2: { influence: 12, experience: 400 },
  3: { influence: 10, experience: 350 },
  4: { influence: 8, experience: 300 },
  5: { influence: 7, experience: 250 },
  6: { influence: 6, experience: 200 },
  7: { influence: 5, experience: 150 },
  8: { influence: 4, experience: 100 },
};

const PLACES = [1, 2, 3, 4, 5, 6, 7, 8];

export function SpecialSectorModal({ sector, teams, onCancel, onDone }: Props) {
  // teamId -> place (0 = not placed). A place may be shared by several teams.
  const [byTeam, setByTeam] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep team order so a tie for 1st resolves the sector colour predictably
  // (server hands it to the first-listed 1st-place team).
  const assignments = useMemo<SpecialPlaceAssignment[]>(
    () =>
      teams
        .filter((t) => byTeam[t.id])
        .map((t) => ({ team_id: t.id, place: byTeam[t.id] })),
    [teams, byTeam],
  );

  const firstPlaceCount = useMemo(
    () => assignments.filter((a) => a.place === 1).length,
    [assignments],
  );

  const canSubmit = assignments.length > 0 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await captureSpecialSector(sector.id, assignments);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось провести захват');
      setBusy(false);
    }
  }

  const label = sector.number != null ? `Особый сектор №${sector.number}` : 'Особый сектор';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 border border-neutral-400 rounded-md w-full max-w-lg shadow-3 max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-center gap-4 px-5 py-4 bg-neutral-100 border-b border-neutral-300">
          <div
            aria-hidden
            className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-md bg-brand-700 text-neutral-1000 shadow-2"
          >
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-heading-sm text-neutral-1000 leading-tight truncate">
              {label}
            </h2>
            <p className="text-xs text-neutral-700 mt-1">
              Выберите место каждой команды — награды раздадутся по таблице.
              Одно место можно дать нескольким командам (ничья). 1 место красит
              сектор и идёт в кубки захвата.
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-shrink-0 p-1 -mr-1 text-neutral-700 hover:text-neutral-1000 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <div className="p-5 space-y-4">
          {error && <ErrorBanner message={error} />}

          <div className="space-y-2">
            {teams.map((team) => {
              const place = byTeam[team.id] ?? 0;
              const reward = place ? PLACE_REWARDS[place] : null;
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-3 px-3 py-2 bg-neutral-100 border border-neutral-400 rounded-sm"
                >
                  <span
                    aria-hidden
                    className="flex-shrink-0 w-4 h-4 rounded-full border border-neutral-400"
                    style={{ backgroundColor: team.color ?? 'transparent' }}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm text-neutral-1000">
                    {team.name}
                  </span>
                  <div className="flex-shrink-0 w-24 text-2xs uppercase tracking-wider text-neutral-700 text-right">
                    {reward ? (
                      <>
                        <span className="font-mono text-neutral-900">+{reward.influence}</span> вл.{' '}
                        <span className="font-mono text-neutral-900">+{reward.experience}</span> оп.
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    <Trophy
                      className={`w-4 h-4 ${place === 1 ? 'text-warning-text' : 'text-neutral-700'}`}
                    />
                    <select
                      value={place}
                      onChange={(e) =>
                        setByTeam((prev) => ({ ...prev, [team.id]: Number(e.target.value) }))
                      }
                      disabled={busy}
                      className="px-2 py-1.5 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500 disabled:opacity-50"
                    >
                      <option value={0}>— нет —</option>
                      {PLACES.map((p) => (
                        <option key={p} value={p}>
                          {p} место
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {firstPlaceCount > 1 && (
            <p className="text-xs text-neutral-700">
              1 место у нескольких команд — сектор покрасит первая в списке, но
              награду 1 места получат все.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              isLoading={busy}
            >
              Провести захват
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
