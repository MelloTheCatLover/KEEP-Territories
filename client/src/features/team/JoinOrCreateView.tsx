import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Loader2, MapPin, UserPlus } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getSectorsMap } from '../map/api';
import type { Sector } from '../map/types';
import { getTeams, joinTeam } from './api';
import type { Team } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; teams: Team[]; sectors: Sector[] };

export function JoinOrCreateView() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observerNotice, setObserverNotice] = useState<string | null>(null);

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

  async function handleJoin(teamId: string) {
    setJoiningId(teamId);
    setError(null);
    setObserverNotice(null);
    try {
      await joinTeam(teamId);
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setObserverNotice(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Не удалось вступить в команду');
      }
    } finally {
      setJoiningId(null);
    }
  }

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

  const homeBases = state.sectors.filter((s) => s.is_home_base);
  const freeBases = homeBases.filter((s) => s.home_team_id === null);
  const noMap = homeBases.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Команда</h1>
        <p className="text-sm text-neutral-700">
          Создайте команду на карте или вступите в существующую.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {observerNotice && (
        <Card>
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">Режим наблюдателя</h2>
              <p className="text-sm text-neutral-700">{observerNotice}</p>
            </div>
          </div>
        </Card>
      )}

      {noMap ? (
        <Card>
          <p className="text-sm text-neutral-700">
            Карта ещё не сгенерирована. Дождитесь администратора.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
                Создать команду
              </h2>
              <p className="text-sm text-neutral-700 mb-3">
                Выберите свободный домашний сектор на карте.{' '}
                <span className="text-neutral-900">Свободных: {freeBases.length}</span>
                {freeBases.length === 0 && (
                  <span className="text-warning-text"> — максимум команд достигнут.</span>
                )}
              </p>
              <Button
                variant="primary"
                onClick={() => navigate('/map')}
                disabled={freeBases.length === 0}
              >
                Перейти на карту
              </Button>
            </div>
          </div>
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
                    disabled={joiningId !== null}
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
