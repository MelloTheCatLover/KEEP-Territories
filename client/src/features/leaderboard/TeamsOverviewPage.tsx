import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getSectorsMap } from '../map/api';
import { getTeams, getTeam } from '../team/api';
import type { TeamFullStats } from '../team/types';
import { TeamSummaryCard } from '../map/TeamSidePanel';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      teams: TeamFullStats[];
      indexById: Record<string, number>;
      pendingByTeam: Map<string, number>;
    };

export function TeamsOverviewPage() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [teams, sectors] = await Promise.all([getTeams(), getSectorsMap()]);
      const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
      const indexById: Record<string, number> = {};
      sorted.forEach((t, i) => {
        indexById[t.id] = i;
      });
      const full = await Promise.all(sorted.map((t) => getTeam(t.id)));
      const pendingByTeam = new Map<string, number>();
      for (const s of sectors) {
        if (s.active_submission_team_id) {
          pendingByTeam.set(
            s.active_submission_team_id,
            (pendingByTeam.get(s.active_submission_team_id) ?? 0) + 1,
          );
        }
      }
      setState({ status: 'ready', teams: full, indexById, pendingByTeam });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить команды';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ownTeamId = user?.team_id ?? null;

  const ranked = useMemo(() => {
    if (state.status !== 'ready') return [];
    return [...state.teams].sort(
      (a, b) => b.influence - a.influence || b.experience - a.experience,
    );
  }, [state]);

  const maxLeadership = useMemo(() => {
    if (state.status !== 'ready') return 0;
    return state.teams.reduce((m, t) => Math.max(m, t.stats.leadership), 0);
  }, [state]);

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 space-y-4">
      <Link
        to="/map"
        className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
      >
        <ArrowLeft className="w-4 h-4" />
        К карте
      </Link>

      <div>
        <h1 className="font-display text-heading-sm sm:text-heading-md text-neutral-1000 mb-1">
          Команды
        </h1>
        <p className="text-sm text-neutral-700">
          Краткие характеристики всех команд.
        </p>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="bg-danger-bg text-danger-text text-sm px-3 py-2 rounded-sm border border-danger">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && ranked.length === 0 && (
        <div className="text-neutral-700 text-sm">Команд пока нет.</div>
      )}

      {state.status === 'ready' && ranked.length > 0 && (
        <div className="grid grid-cols-2 gap-3 items-start">
          {ranked.map((team) => (
            <TeamSummaryCard
              key={team.id}
              team={team}
              index={state.indexById[team.id] ?? 0}
              isOwn={team.id === ownTeamId}
              pendingCount={state.pendingByTeam.get(team.id) ?? 0}
              statsLayout="list"
              isLeadershipLeader={maxLeadership > 0 && team.stats.leadership === maxLeadership}
            />
          ))}
        </div>
      )}
    </div>
  );
}
