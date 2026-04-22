import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import { getSectorsMap } from './api';
import type { Sector } from './types';
import { HexMap, type TeamInfo } from './HexMap';
import { SectorActionModal } from './SectorActionModal';
import { api, ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { CreateTeamModal } from '../team/CreateTeamModal';

type TeamDto = { id: string; name: string; color: string | null };

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; sectors: Sector[]; teamsById: Record<string, TeamInfo> };

export function MapPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [createFor, setCreateFor] = useState<Sector | null>(null);
  const [actionFor, setActionFor] = useState<Sector | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [sectors, teams] = await Promise.all([
        getSectorsMap(),
        api.get<TeamDto[]>('/teams'),
      ]);
      if (sectors.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
      const teamsById: Record<string, TeamInfo> = {};
      sorted.forEach((t, i) => {
        teamsById[t.id] = { id: t.id, name: t.name, index: i, color: t.color };
      });
      setState({ status: 'ready', sectors, teamsById });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить карту';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreateTeam = user?.team_id === null;
  const teamId = user?.team_id ?? null;

  const reachableIds = useMemo(() => {
    if (!teamId || state.status !== 'ready') return undefined;
    const owned = new Set<string>();
    state.sectors.forEach((s) => {
      if (s.captured_by_team_id === teamId) owned.add(`${s.q}:${s.r}`);
    });
    const offsets: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
    ];
    const set = new Set<string>();
    state.sectors.forEach((s) => {
      if (s.captured_by_team_id === teamId) return;
      if (s.is_home_base) return;
      const adjacent = offsets.some(([dq, dr]) => owned.has(`${s.q + dq}:${s.r + dr}`));
      if (adjacent) set.add(s.id);
    });
    return set;
  }, [teamId, state]);

  const highlightIds = useMemo(() => {
    if (canCreateTeam && state.status === 'ready') {
      const set = new Set<string>();
      state.sectors.forEach((s) => {
        if (s.is_home_base && s.home_team_id === null) set.add(s.id);
      });
      return set;
    }
    return reachableIds;
  }, [canCreateTeam, state, reachableIds]);

  const handleClick = useCallback(
    (s: Sector) => {
      if (canCreateTeam) {
        if (!s.is_home_base || s.home_team_id !== null) return;
        setCreateFor(s);
        return;
      }
      if (teamId) {
        setActionFor(s);
      }
    },
    [canCreateTeam, teamId],
  );

  const freeHomeCount = useMemo(() => {
    if (state.status !== 'ready') return 0;
    return state.sectors.filter((s) => s.is_home_base && s.home_team_id === null).length;
  }, [state]);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Карта</h1>
      <p className="text-sm text-neutral-700 mb-4">
        Гексагональное поле
        {state.status === 'ready' ? ` — ${state.sectors.length} секторов.` : '.'}
      </p>

      {canCreateTeam && state.status === 'ready' && (
        <div className="mb-4 flex items-start gap-2 bg-brand-900/30 border border-brand-700 text-sm text-brand-100 px-3 py-2 rounded-sm">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-300" />
          <span>
            Кликните по свободному домашнему сектору, чтобы создать команду.
            {' '}
            <span className="text-brand-300">Свободных: {freeHomeCount}</span>
          </span>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка карты...</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="bg-danger-bg text-danger-text text-sm px-3 py-2 rounded-sm border border-danger max-w-md">
          {state.message}
        </div>
      )}

      {state.status === 'empty' && (
        <div className="text-neutral-700 text-sm">
          Карта не сгенерирована. Обратитесь к администратору.
        </div>
      )}

      {state.status === 'ready' && (
        <HexMap
          sectors={state.sectors}
          teamsById={state.teamsById}
          onSectorClick={canCreateTeam || teamId ? handleClick : undefined}
          highlightIds={highlightIds}
        />
      )}

      {createFor && (
        <CreateTeamModal
          sector={createFor}
          onCancel={() => setCreateFor(null)}
          onCreated={async () => {
            setCreateFor(null);
            await refreshUser();
            navigate('/team');
          }}
        />
      )}

      {actionFor && teamId && state.status === 'ready' && (
        <SectorActionModal
          sector={actionFor}
          allSectors={state.sectors}
          userTeamId={teamId}
          onCancel={() => setActionFor(null)}
          onStarted={(submissionId) => {
            setActionFor(null);
            navigate(`/sectors/${actionFor.id}?submission=${submissionId}`);
          }}
        />
      )}
    </div>
  );
}
