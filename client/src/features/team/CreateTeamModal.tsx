import { useState } from 'react';
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
  onCancel: () => void;
  onCreated: () => Promise<void> | void;
};

export function CreateTeamModal({ sector, onCancel, onCreated }: Props) {
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<TeamColorKey | null>(TEAM_COLOR_ORDER[0]);
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
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3 space-y-4"
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
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColorKey(key)}
                  disabled={busy}
                  className={`w-8 h-8 rounded-full border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    selected
                      ? 'border-neutral-1000 scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.base }}
                  title={key}
                  aria-label={`Цвет ${key}`}
                  aria-pressed={selected}
                />
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
