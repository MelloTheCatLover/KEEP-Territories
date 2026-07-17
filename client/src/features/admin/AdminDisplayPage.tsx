import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getSectorsMap } from '../map/api';
import type { Sector } from '../map/types';
import { HexMap, type TeamInfo } from '../map/HexMap';
import { computeMapLayout } from '../map/map-layout';
import { TeamSummaryCard } from '../map/TeamSidePanel';
import { getTeams, getTeam } from '../team/api';
import type { TeamFullStats } from '../team/types';

/** How often the display refetches the board. */
const REFRESH_MS = 5000;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      sectors: Sector[];
      teamsById: Record<string, TeamInfo>;
      fullTeams: TeamFullStats[];
      at: Date;
    };

export function AdminDisplayPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const fetchBoard = useCallback(async (silent: boolean) => {
    if (!silent) setState({ status: 'loading' });
    try {
      const [sectors, teams] = await Promise.all([getSectorsMap(), getTeams()]);
      if (sectors.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
      const teamsById: Record<string, TeamInfo> = {};
      sorted.forEach((t, i) => {
        teamsById[t.id] = { id: t.id, name: t.name, index: i, color: t.color };
      });
      const fullTeams = await Promise.all(sorted.map((t) => getTeam(t.id)));
      setState({ status: 'ready', sectors, teamsById, fullTeams, at: new Date() });
    } catch {
      // Keep the last good board on screen if a refresh fails.
      if (!silent) setState({ status: 'error', message: 'Не удалось загрузить карту' });
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchBoard(false);
    const id = setInterval(() => void fetchBoard(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [isAdmin, fetchBoard]);

  const mapLayout = useMemo(
    () =>
      state.status === 'ready'
        ? computeMapLayout(state.sectors, state.fullTeams, state.teamsById)
        : null,
    [state],
  );

  const pendingByTeam = useMemo(() => {
    const map = new Map<string, number>();
    if (state.status !== 'ready') return map;
    for (const s of state.sectors) {
      if (s.active_submission_team_id) {
        map.set(s.active_submission_team_id, (map.get(s.active_submission_team_id) ?? 0) + 1);
      }
    }
    return map;
  }, [state]);

  const maxLeadership = useMemo(
    () =>
      state.status === 'ready'
        ? state.fullTeams.reduce((m, t) => Math.max(m, t.stats.leadership), 0)
        : 0,
    [state],
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-700">
        Доступно только администраторам.{' '}
        <Link to="/map" className="ml-2 text-brand-500 underline">
          На карту
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      {state.status === 'loading' && (
        <div className="flex-1 flex items-center justify-center gap-3 text-neutral-700">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          <span>Загрузка карты...</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex-1 flex items-center justify-center text-danger-text">
          {state.message}
        </div>
      )}

      {state.status === 'empty' && (
        <div className="flex-1 flex items-center justify-center text-neutral-700">
          Карта не сгенерирована.
        </div>
      )}

      {state.status === 'ready' && mapLayout && (
        <div className="flex-1 p-4 grid gap-4 lg:items-stretch lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(240px,320px)]">
          <div className="hidden gap-3 lg:flex lg:flex-col lg:justify-center">
            {mapLayout.left.map((entry) => {
              return (
                <TeamSummaryCard
                  key={entry.team.id}
                  team={entry.team}
                  index={entry.index}
                  isOwn={false}
                  pendingCount={pendingByTeam.get(entry.team.id) ?? 0}
                  isLeadershipLeader={
                    maxLeadership > 0 && entry.team.stats.leadership === maxLeadership
                  }
                />
              );
            })}
          </div>

          <div
            className="relative w-full self-center max-h-[92vh]"
            style={{ aspectRatio: `${mapLayout.vbW} / ${mapLayout.vbH}` }}
          >
            <div className="absolute inset-0">
              <HexMap sectors={state.sectors} teamsById={state.teamsById} />
            </div>
          </div>

          <div className="hidden gap-3 lg:flex lg:flex-col lg:justify-center">
            {mapLayout.right.map((entry) => {
              return (
                <TeamSummaryCard
                  key={entry.team.id}
                  team={entry.team}
                  index={entry.index}
                  isOwn={false}
                  pendingCount={pendingByTeam.get(entry.team.id) ?? 0}
                  isLeadershipLeader={
                    maxLeadership > 0 && entry.team.stats.leadership === maxLeadership
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="px-4 py-1 text-2xs text-neutral-600 text-right">
          Обновлено в {state.at.toLocaleTimeString('ru-RU')} · авто-обновление каждые{' '}
          {REFRESH_MS / 1000} с
        </div>
      )}
    </div>
  );
}
