import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Plus, UserPlus } from 'lucide-react';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getSectorsMap } from '../map/api';
import type { Sector } from '../map/types';
import { createTeam, getTeams, joinTeam } from './api';
import type { Team } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; teams: Team[]; sectors: Sector[] };

export function JoinOrCreateView() {
  const { refreshUser } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [homeSectorId, setHomeSectorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [teams, sectors] = await Promise.all([getTeams(), getSectorsMap()]);
      setState({ status: 'ready', teams, sectors });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить данные',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { homeBases, teamsById } = useMemo(() => {
    if (state.status !== 'ready') return { homeBases: [] as Sector[], teamsById: {} as Record<string, Team> };
    const map: Record<string, Team> = {};
    state.teams.forEach((t) => {
      map[t.id] = t;
    });
    const bases = state.sectors
      .filter((s) => s.is_home_base)
      .sort((a, b) => a.number - b.number);
    return { homeBases: bases, teamsById: map };
  }, [state]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Название команды обязательно');
      return;
    }
    if (!homeSectorId) {
      setError('Выберите домашний сектор');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createTeam({ name: trimmed, home_sector_id: homeSectorId });
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

  if (state.status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 flex items-center gap-3 text-neutral-700">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        <span>Загрузка...</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <ErrorBanner message={state.message} />
      </div>
    );
  }

  const freeBases = homeBases.filter((s) => !s.home_team_id);
  const noMap = homeBases.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Команда</h1>
        <p className="text-sm text-neutral-700">
          Выберите свободный домашний сектор и создайте команду — или вступите в существующую.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {noMap && (
        <Card>
          <p className="text-sm text-neutral-700">
            Карта ещё не сгенерирована. Дождитесь, когда администратор её создаст.
          </p>
        </Card>
      )}

      {!noMap && (
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
                maxLength={50}
                disabled={busy}
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-neutral-800" />
                <Label className="mb-0">Домашний сектор</Label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {homeBases.map((s) => {
                  const occupiedBy = s.home_team_id ? teamsById[s.home_team_id] : null;
                  const taken = Boolean(occupiedBy);
                  const selected = homeSectorId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => !taken && setHomeSectorId(s.id)}
                      disabled={taken || busy}
                      className={`text-left px-3 py-2 rounded-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected
                          ? 'border-brand-500 bg-brand-500/10 text-neutral-1000'
                          : taken
                          ? 'border-neutral-400 bg-neutral-200 text-neutral-700'
                          : 'border-neutral-400 hover:border-neutral-600 text-neutral-1000'
                      }`}
                      aria-pressed={selected}
                    >
                      <div className="font-mono text-sm">
                        #{s.number} ({s.q}, {s.r})
                      </div>
                      <div className="text-xs text-neutral-700 mt-0.5">
                        {occupiedBy ? `Занят: ${occupiedBy.name}` : 'Свободен'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {freeBases.length === 0 && (
                <p className="text-xs text-warning-text mt-2">
                  Все домашние сектора заняты — максимум команд достигнут.
                </p>
              )}
            </div>

            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || freeBases.length === 0 || !homeSectorId}
                isLoading={creating}
              >
                Создать
              </Button>
            </div>
          </form>
        </Card>
      )}

      {state.teams.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-5 h-5 text-neutral-800" />
            <h2 className="font-display text-heading-sm text-neutral-1000">
              Существующие команды
            </h2>
          </div>
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
        </section>
      )}
    </div>
  );
}
