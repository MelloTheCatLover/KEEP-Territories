import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MapPin, Users } from 'lucide-react';
import { getSectorsMap } from './api';
import type { Sector } from './types';
import { HexMap, type TeamInfo } from './HexMap';
import { computeMapLayout, LEFT_SLOTS, RIGHT_SLOTS } from './map-layout';
import { SectorActionModal } from './SectorActionModal';
import { SpecialSectorModal } from './SpecialSectorModal';
import { TeamSummaryCard } from './TeamSidePanel';
import { ApiError } from '../../shared/api/client';
import { getTeams, getTeam } from '../team/api';
import type { TeamFullStats } from '../team/types';
import { useAuth } from '../auth/AuthContext';
import { CreateTeamModal } from '../team/CreateTeamModal';
import { TrophySection } from '../trophies/TrophySection';
import { AdminReviewQueue } from './AdminReviewQueue';
import { TeamManageModal } from '../admin/team-modals';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      sectors: Sector[];
      teamsById: Record<string, TeamInfo>;
      fullTeams: TeamFullStats[];
    };

export function MapPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [createFor, setCreateFor] = useState<Sector | null>(null);
  const [actionFor, setActionFor] = useState<Sector | null>(null);
  const [specialFor, setSpecialFor] = useState<Sector | null>(null);
  const [manageTeamId, setManageTeamId] = useState<string | null>(null);

  const fetchMap = useCallback(async (silent: boolean) => {
    // Silent refresh (e.g. after a queue decision) keeps the current map on
    // screen instead of flashing the loading state.
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
      setState({ status: 'ready', sectors, teamsById, fullTeams });
    } catch (err) {
      if (silent) return;
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить карту';
      setState({ status: 'error', message });
    }
  }, []);

  const load = useCallback(() => fetchMap(false), [fetchMap]);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = user?.role === 'admin';

  // Admins are never team members — they drive the field on behalf of a team
  // picked here ("играю за команду"), persisted across reloads.
  const [actingTeamId, setActingTeamIdState] = useState<string | null>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('acting_team_id') : null),
  );
  const setActingTeam = useCallback((id: string | null) => {
    setActingTeamIdState(id);
    if (id) localStorage.setItem('acting_team_id', id);
    else localStorage.removeItem('acting_team_id');
  }, []);

  const teamId = isAdmin ? actingTeamId : user?.team_id ?? null;
  // Players create their own team; admins never create via the map.
  const canCreateTeam = !isAdmin && user?.team_id === null;
  // Participants are observers — they view the map but never act on the field.
  // Only admins drive captures and changes.
  const isObserver = !isAdmin;

  // Drop a stale acting team if it no longer exists on the loaded map.
  useEffect(() => {
    if (!isAdmin || actingTeamId === null || state.status !== 'ready') return;
    if (!state.teamsById[actingTeamId]) setActingTeam(null);
  }, [isAdmin, actingTeamId, state, setActingTeam]);

  const teamOptions = useMemo(() => {
    if (state.status !== 'ready') return [];
    return Object.values(state.teamsById).sort((a, b) => a.index - b.index);
  }, [state]);

  const userActiveSectorId = useMemo(() => {
    if (!teamId || state.status !== 'ready') return null;
    const found = state.sectors.find(
      (s) => s.active_submission_team_id === teamId,
    );
    return found?.id ?? null;
  }, [state, teamId]);

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
      if (s.is_special) return;
      const adjacent = offsets.some(([dq, dr]) => owned.has(`${s.q + dq}:${s.r + dr}`));
      if (adjacent) set.add(s.id);
    });
    return set;
  }, [teamId, state]);

  const highlightIds = useMemo(() => {
    if (isObserver) return undefined;
    if (canCreateTeam && state.status === 'ready') {
      const set = new Set<string>();
      state.sectors.forEach((s) => {
        if (s.is_home_base && s.home_team_id === null) set.add(s.id);
      });
      return set;
    }
    if (userActiveSectorId) {
      return new Set<string>([userActiveSectorId]);
    }
    return reachableIds;
  }, [canCreateTeam, state, reachableIds, userActiveSectorId, isObserver]);

  const handleClick = useCallback(
    (s: Sector) => {
      if (isObserver) return;
      // Special sectors: admins run a place-based event instead of a capture.
      if (s.is_special) {
        if (isAdmin) setSpecialFor(s);
        return;
      }
      if (canCreateTeam) {
        if (!s.is_home_base || s.home_team_id !== null) return;
        setCreateFor(s);
        return;
      }
      if (teamId) {
        setActionFor(s);
      }
    },
    [canCreateTeam, teamId, isObserver, isAdmin],
  );

  const freeHomeCount = useMemo(() => {
    if (state.status !== 'ready') return 0;
    return state.sectors.filter((s) => s.is_home_base && s.home_team_id === null).length;
  }, [state]);

  const takenColors = useMemo<ReadonlySet<string>>(() => {
    if (state.status !== 'ready') return new Set();
    const set = new Set<string>();
    Object.values(state.teamsById).forEach((t) => {
      if (t.color) set.add(t.color.toUpperCase());
    });
    return set;
  }, [state]);

  const pendingByTeam = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of state.sectors) {
      if (s.active_submission_team_id) {
        map.set(
          s.active_submission_team_id,
          (map.get(s.active_submission_team_id) ?? 0) + 1,
        );
      }
    }
    return map;
  }, [state]);

  // Highest leadership across teams — that team(s) gets the gold frame.
  const maxLeadership = useMemo(() => {
    if (state.status !== 'ready') return 0;
    return state.fullTeams.reduce((m, t) => Math.max(m, t.stats.leadership), 0);
  }, [state]);

  const mapLayout = useMemo(
    () =>
      state.status === 'ready'
        ? computeMapLayout(state.sectors, state.fullTeams, state.teamsById)
        : null,
    [state],
  );

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="font-display text-heading-sm sm:text-heading-md text-neutral-1000">Карта</h1>
        <Link
          to="/teams"
          className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-neutral-400 text-sm font-medium text-neutral-900 hover:bg-neutral-200 hover:text-neutral-1000 transition-colors"
        >
          <Users className="w-4 h-4" />
          Команды
        </Link>
      </div>

      {isAdmin && state.status === 'ready' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 bg-neutral-100 border border-neutral-400 px-3 py-2 rounded-sm">
          <span className="text-sm font-medium text-neutral-900">Играю за:</span>
          <select
            value={actingTeamId ?? ''}
            onChange={(e) => setActingTeam(e.target.value || null)}
            className="px-2 py-1.5 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500 max-w-[16rem]"
          >
            <option value="">— выберите команду —</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {actingTeamId && state.teamsById[actingTeamId]?.color && (
            <span
              aria-hidden
              className="w-4 h-4 rounded-full border border-neutral-400 flex-shrink-0"
              style={{ backgroundColor: state.teamsById[actingTeamId].color ?? undefined }}
            />
          )}
        </div>
      )}

      {!isObserver && canCreateTeam && state.status === 'ready' && (
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

      {state.status === 'ready' && mapLayout && (
        <div
          className={`grid gap-4 lg:items-stretch ${
            isAdmin
              ? 'lg:grid-cols-[minmax(240px,290px)_minmax(0,1fr)_minmax(240px,290px)] xl:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(220px,260px)_minmax(300px,360px)]'
              : 'lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(260px,300px)]'
          }`}
        >
          <div className="hidden gap-3 lg:order-1 lg:flex lg:flex-col lg:justify-center">
            {LEFT_SLOTS.map((key) => {
              const entry = mapLayout.slots[key];
              if (!entry) return null;
              return (
                <TeamSummaryCard
                  key={key}
                  team={entry.team}
                  index={entry.index}
                  isOwn={entry.team.id === teamId}
                  pendingCount={pendingByTeam.get(entry.team.id) ?? 0}
                  isLeadershipLeader={
                    maxLeadership > 0 && entry.team.stats.leadership === maxLeadership
                  }
                  onManage={isAdmin ? () => setManageTeamId(entry.team.id) : undefined}
                />
              );
            })}
          </div>

          <div
            className="relative w-full self-center order-1 lg:order-2 lg:max-h-[82vh]"
            style={{
              aspectRatio: `${mapLayout.vbW} / ${mapLayout.vbH}`,
            }}
          >
            <div className="absolute inset-0">
              <HexMap
                sectors={state.sectors}
                teamsById={state.teamsById}
                onSectorClick={!isObserver && (canCreateTeam || teamId || isAdmin) ? handleClick : undefined}
                highlightIds={highlightIds}
              />
            </div>
          </div>

          <div className="hidden gap-3 lg:order-3 lg:flex lg:flex-col lg:justify-center">
            {RIGHT_SLOTS.map((key) => {
              const entry = mapLayout.slots[key];
              if (!entry) return null;
              return (
                <TeamSummaryCard
                  key={key}
                  team={entry.team}
                  index={entry.index}
                  isOwn={entry.team.id === teamId}
                  pendingCount={pendingByTeam.get(entry.team.id) ?? 0}
                  isLeadershipLeader={
                    maxLeadership > 0 && entry.team.stats.leadership === maxLeadership
                  }
                  onManage={isAdmin ? () => setManageTeamId(entry.team.id) : undefined}
                />
              );
            })}
          </div>

          {isAdmin && (
            <div className="order-2 flex flex-col lg:order-last lg:col-span-3 xl:order-4 xl:col-span-1">
              <AdminReviewQueue onActed={() => void fetchMap(true)} />
            </div>
          )}
        </div>
      )}

      {isAdmin && state.status === 'ready' && <TrophySection />}

      {createFor && (
        <CreateTeamModal
          sector={createFor}
          takenColors={takenColors}
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
          userStrength={
            state.fullTeams.find((t) => t.id === teamId)?.stats.strength ?? 0
          }
          userActiveSectorId={userActiveSectorId}
          onCancel={() => setActionFor(null)}
          onStarted={(submissionId) => {
            setActionFor(null);
            navigate(`/sectors/${actionFor.id}?submission=${submissionId}`);
          }}
          onNavigateToActive={(sectorId) => {
            setActionFor(null);
            navigate(`/sectors/${sectorId}`);
          }}
        />
      )}

      {manageTeamId && (
        <TeamManageModal
          teamId={manageTeamId}
          onClose={() => setManageTeamId(null)}
          onChanged={() => void fetchMap(true)}
        />
      )}

      {specialFor && state.status === 'ready' && (
        <SpecialSectorModal
          sector={specialFor}
          teams={teamOptions.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          onCancel={() => setSpecialFor(null)}
          onDone={async () => {
            setSpecialFor(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
