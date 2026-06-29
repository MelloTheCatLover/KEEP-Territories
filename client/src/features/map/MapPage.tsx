import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MapPin, Users } from 'lucide-react';
import { getSectorsMap } from './api';
import type { Sector } from './types';
import { HexMap, type TeamInfo, MAP_HEX_SIZE, MAP_VIEWBOX_PADDING } from './HexMap';
import { bbox } from './hex-utils';
import { SectorActionModal } from './SectorActionModal';
import { TeamSummaryCard } from './TeamSidePanel';
import { ApiError } from '../../shared/api/client';
import { getTeams, getTeam } from '../team/api';
import type { TeamFullStats } from '../team/types';
import { useAuth } from '../auth/AuthContext';
import { CreateTeamModal } from '../team/CreateTeamModal';
import { TrophySection } from '../trophies/TrophySection';

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

  const load = useCallback(async () => {
    setState({ status: 'loading' });
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
  // Participants are observers — they view the map but never act on the field.
  // Only admins drive captures and changes.
  const isObserver = user?.role !== 'admin';

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
      if (s.is_special || isObserver) return;
      if (canCreateTeam) {
        if (!s.is_home_base || s.home_team_id !== null) return;
        setCreateFor(s);
        return;
      }
      if (teamId) {
        setActionFor(s);
      }
    },
    [canCreateTeam, teamId, isObserver],
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

  type SlotKey = 'tl' | 'tr' | 'l' | 'r' | 'bl' | 'br';

  const mapLayout = useMemo(() => {
    if (state.status !== 'ready' || state.sectors.length === 0) {
      return null;
    }
    const { minX, minY, maxX, maxY } = bbox(state.sectors, MAP_HEX_SIZE);
    const vbW = maxX - minX + MAP_VIEWBOX_PADDING * 2;
    const vbH = maxY - minY + MAP_VIEWBOX_PADDING * 2;

    const slots: Partial<Record<SlotKey, { team: TeamFullStats; index: number }>> = {};
    const homeBaseByTeam = new Map<string, { q: number; r: number }>();
    state.sectors.forEach((s) => {
      if (s.is_home_base && s.home_team_id) {
        homeBaseByTeam.set(s.home_team_id, { q: s.q, r: s.r });
      }
    });
    state.fullTeams.forEach((team) => {
      const hb = homeBaseByTeam.get(team.id);
      if (!hb) return;
      const hx = Math.sqrt(3) * hb.q + (Math.sqrt(3) / 2) * hb.r;
      const hy = 1.5 * hb.r;
      let key: SlotKey;
      if (Math.abs(hy) < 0.001) {
        key = hx < 0 ? 'l' : 'r';
      } else if (hy < 0) {
        key = hx < 0 ? 'tl' : 'tr';
      } else {
        key = hx < 0 ? 'bl' : 'br';
      }
      const index = state.teamsById[team.id]?.index ?? 0;
      if (!slots[key]) slots[key] = { team, index };
    });
    return { vbW, vbH, slots };
  }, [state]);

  const LEFT_SLOTS: SlotKey[] = ['tl', 'l', 'bl'];
  const RIGHT_SLOTS: SlotKey[] = ['tr', 'r', 'br'];

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-heading-sm sm:text-heading-md text-neutral-1000 mb-1">Карта</h1>
          <p className="text-sm text-neutral-700">
            Гексагональное поле
            {state.status === 'ready' ? ` — ${state.sectors.length} секторов.` : '.'}
          </p>
        </div>
        <Link
          to="/teams"
          className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-neutral-400 text-sm font-medium text-neutral-900 hover:bg-neutral-200 hover:text-neutral-1000 transition-colors"
        >
          <Users className="w-4 h-4" />
          Команды
        </Link>
      </div>

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
        <div className="grid gap-4 lg:items-stretch lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(260px,300px)]">
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
                onSectorClick={!isObserver && (canCreateTeam || teamId) ? handleClick : undefined}
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
                />
              );
            })}
          </div>
        </div>
      )}

      {state.status === 'ready' && <TrophySection />}

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
    </div>
  );
}
