import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { teamColors, TEAM_COLOR_ORDER, type TeamColorKey } from '../../design-system/design-tokens';
import { createTeam, getTeams, joinTeam } from './api';
import type { Team } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; teams: Team[] };

export function JoinOrCreateView() {
  const { refreshUser } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<TeamColorKey | null>(TEAM_COLOR_ORDER[0]);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const teams = await getTeams();
      setState({ status: 'ready', teams });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить команды',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Название команды обязательно');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createTeam({
        name: trimmed,
        color: colorKey ? teamColors[colorKey].base : null,
      });
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать команду');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(teamId: string) {
    setJoiningId(teamId);
    setError(null);
    try {
      await joinTeam(teamId);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось вступить в команду');
    } finally {
      setJoiningId(null);
    }
  }

  const busy = creating || joiningId !== null;

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Команда</h1>
        <p className="text-sm text-neutral-700">
          Создайте новую команду или присоединитесь к существующей.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-400" />
            <h2 className="font-display text-heading-sm text-neutral-1000">Создать команду</h2>
          </div>

          <div>
            <Label htmlFor="team-name">Название</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Альфа"
              maxLength={64}
              disabled={busy}
            />
          </div>

          <div>
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2 mt-1">
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

          <div>
            <Button type="submit" variant="primary" disabled={busy} isLoading={creating}>
              Создать
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-neutral-800" />
          <h2 className="font-display text-heading-sm text-neutral-1000">Существующие команды</h2>
        </div>

        {state.status === 'loading' && (
          <div className="flex items-center gap-3 text-neutral-700">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            <span>Загрузка...</span>
          </div>
        )}
        {state.status === 'error' && <ErrorBanner message={state.message} />}
        {state.status === 'ready' && state.teams.length === 0 && (
          <Card>
            <p className="text-sm text-neutral-700">
              Пока нет ни одной команды — создайте первую.
            </p>
          </Card>
        )}
        {state.status === 'ready' && state.teams.length > 0 && (
          <Card>
            <ul className="divide-y divide-neutral-300">
              {state.teams.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 border border-glass"
                      style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                      aria-hidden
                    />
                    <span className="text-neutral-1000 truncate">{t.name}</span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleJoin(t.id)}
                    disabled={busy}
                    isLoading={joiningId === t.id}
                  >
                    Вступить
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
