import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  teamColors,
  TEAM_COLOR_ORDER,
  type TeamColorKey,
} from '../../design-system/design-tokens';
import type { Sector } from '../map/types';
import { createTeam } from './api';

type Props = {
  sector: Sector;
  takenColors?: ReadonlySet<string>;
  onCancel: () => void;
  onCreated: () => Promise<void> | void;
};

const EMPTY_TAKEN: ReadonlySet<string> = new Set();

function normalizeHex(hex: string): string {
  return hex.toUpperCase();
}

function isTaken(key: TeamColorKey, taken: ReadonlySet<string>): boolean {
  return taken.has(normalizeHex(teamColors[key].base));
}

export function CreateTeamModal({ sector, takenColors = EMPTY_TAKEN, onCancel, onCreated }: Props) {
  const initialKey = useMemo<TeamColorKey | null>(() => {
    return TEAM_COLOR_ORDER.find((k) => !isTaken(k, takenColors)) ?? null;
  }, [takenColors]);

  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<TeamColorKey | null>(initialKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Название команды обязательно');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTeam({
        name: trimmed,
        home_sector_id: sector.id,
        color: colorKey ? teamColors[colorKey].base : null,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать команду');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
              Новая команда
            </h2>
            <p className="text-xs text-neutral-700">
              Домашний сектор: ({sector.q}, {sector.r})
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <div>
          <Label htmlFor="create-team-name">Название</Label>
          <Input
            id="create-team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Альфа"
            maxLength={50}
            disabled={busy}
            autoFocus
          />
        </div>

        <div>
          <Label>Цвет команды</Label>
          <p className="text-xs text-neutral-700 mb-2">
            Выбор один раз — позже не меняется.
          </p>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLOR_ORDER.map((key) => {
              const c = teamColors[key];
              const selected = colorKey === key;
              const taken = isTaken(key, takenColors);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !taken && setColorKey(key)}
                  disabled={busy || taken}
                  className={`relative w-8 h-8 rounded-full border-2 transition-all disabled:cursor-not-allowed ${
                    taken
                      ? 'border-transparent opacity-30'
                      : selected
                      ? 'border-neutral-1000 scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.base }}
                  title={taken ? `${key} — занят` : key}
                  aria-label={taken ? `Цвет ${key} занят` : `Цвет ${key}`}
                  aria-pressed={selected}
                >
                  {taken && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-neutral-1000 text-xs leading-none"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setColorKey(null)}
              disabled={busy}
              className={`h-8 px-3 rounded-full border-2 text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                colorKey === null
                  ? 'border-neutral-1000 text-neutral-1000'
                  : 'border-neutral-400 text-neutral-700 hover:border-neutral-600'
              }`}
              aria-pressed={colorKey === null}
            >
              Без цвета
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={busy} isLoading={busy}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Создание...
              </span>
            ) : (
              'Создать'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
