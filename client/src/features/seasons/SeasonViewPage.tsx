import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Film, Loader2, Play, Sparkles, Users } from 'lucide-react';
import { Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { HexMap, type TeamInfo, MAP_HEX_SIZE, MAP_VIEWBOX_PADDING } from '../map/HexMap';
import { bbox } from '../map/hex-utils';
import type { Sector } from '../map/types';
import { TrophyGrid } from '../trophies/TrophySection';
import type { TrophiesResponse } from '../trophies/types';
import {
  getSeasons,
  getSeasonMap,
  getSeasonTeams,
  getSeasonTrophies,
  getSeasonRosters,
  type Season,
  type SeasonRoster,
} from './api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      season: Season;
      sectors: Sector[];
      teamsById: Record<string, TeamInfo>;
      trophies: TrophiesResponse;
      rosters: SeasonRoster[];
    };

/** Overall place-1 teams — the season champions (usually one, more if tied). */
function championIds(trophies: TrophiesResponse): Set<string> {
  const winners = trophies.overall.filter((o) => o.place === 1);
  return new Set(winners.map((w) => w.team_id));
}

export function SeasonViewPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: 'loading' });
    try {
      const [seasons, sectors, teams, trophies, rosters] = await Promise.all([
        getSeasons(),
        getSeasonMap(id),
        getSeasonTeams(id),
        getSeasonTrophies(id),
        getSeasonRosters(id),
      ]);
      const season = seasons.find((s) => s.id === id);
      if (!season) {
        setState({ status: 'error', message: 'Смена не найдена' });
        return;
      }
      const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
      const teamsById: Record<string, TeamInfo> = {};
      sorted.forEach((t, i) => {
        teamsById[t.id] = { id: t.id, name: t.name, index: i, color: t.color };
      });
      setState({ status: 'ready', season, sectors, teamsById, trophies, rosters });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить смену',
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-[1100px] mx-auto px-4 space-y-4">
      <Link to="/seasons" className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300">
        <ArrowLeft className="w-4 h-4" />
        Все смены
      </Link>

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
      )}

      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && (
        <ReadyView
          season={state.season}
          sectors={state.sectors}
          teamsById={state.teamsById}
          trophies={state.trophies}
          rosters={state.rosters}
          viewerUserId={user?.id ?? null}
        />
      )}
    </div>
  );
}

function ReadyView({
  season,
  sectors,
  teamsById,
  trophies,
  rosters,
  viewerUserId,
}: {
  season: Season;
  sectors: Sector[];
  teamsById: Record<string, TeamInfo>;
  trophies: TrophiesResponse;
  rosters: SeasonRoster[];
  viewerUserId: string | null;
}) {
  const isArchived = season.status === 'archived';
  const champions = championIds(trophies);
  const championTeams = Object.values(teamsById).filter((t) => champions.has(t.id));
  const singleChampionId = championTeams.length === 1 ? championTeams[0].id : null;
  const hasTimelapse = sectors.length > 0;
  const myTeam = viewerUserId
    ? rosters.find((r) => r.members.some((m) => m.user_id === viewerUserId)) ?? null
    : null;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">{season.name}</h1>
          <p className="text-sm text-neutral-700">
            {season.status === 'active'
              ? 'Активная смена — режим только для просмотра. Для игры перейдите на карту.'
              : 'Архив смены — только просмотр.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isArchived && (
            <Link
              to={`/seasons/${season.id}/finals`}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-sm bg-brand-700 text-neutral-1000 hover:bg-brand-600 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Итоги смены
            </Link>
          )}
          {hasTimelapse && (
            <Link
              to={`/seasons/${season.id}/timelapse`}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-sm border border-neutral-400 text-neutral-900 hover:border-brand-500 transition-colors"
            >
              <Film className="w-4 h-4" />
              Таймлапс
            </Link>
          )}
          {season.status === 'active' && (
            <Link
              to="/map"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-sm bg-brand-700 text-neutral-1000 hover:bg-brand-600 transition-colors"
            >
              <Play className="w-4 h-4" />
              Играть
            </Link>
          )}
        </div>
      </div>

      {isArchived && championTeams.length > 0 && (
        <ChampionBanner teams={championTeams} />
      )}

      {myTeam && <MyTeamBanner team={myTeam} isChampion={champions.has(myTeam.team_id)} />}

      {sectors.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-700">У этой смены ещё нет карты.</p>
        </Card>
      ) : (
        <SeasonMap sectors={sectors} teamsById={teamsById} />
      )}

      {Object.keys(teamsById).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.values(teamsById).map((t) => {
            const isChampion = champions.has(t.id);
            return (
              <div
                key={t.id}
                className={`flex items-center gap-2 text-sm ${
                  isChampion
                    ? 'text-neutral-1000 font-semibold px-2 py-0.5 rounded-sm bg-warning-bg border border-warning/50'
                    : 'text-neutral-900'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-glass"
                  style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                  aria-hidden
                />
                {t.name}
                {isChampion && <Crown className="w-3.5 h-3.5 text-warning" aria-label="Победитель" />}
              </div>
            );
          })}
        </div>
      )}

      {trophies.trophies.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="font-display text-heading-sm text-neutral-1000">Кубки</h2>
          <TrophyGrid trophies={trophies.trophies} highlightTeamId={singleChampionId} />
        </section>
      )}

      {rosters.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-400" />
            <h2 className="font-display text-heading-sm text-neutral-1000">Составы команд</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start">
            {rosters.map((r) => (
              <RosterCard
                key={r.team_id}
                roster={r}
                isChampion={champions.has(r.team_id)}
                viewerUserId={viewerUserId}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function MyTeamBanner({ team, isChampion }: { team: SeasonRoster; isChampion: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-sm px-4 py-3 border"
      style={{
        borderColor: team.team_color ?? 'var(--color-brand-500)',
        backgroundColor: `color-mix(in srgb, ${team.team_color ?? 'var(--color-brand-500)'} 14%, transparent)`,
      }}
    >
      <span
        className="w-5 h-5 rounded-full border border-glass flex-shrink-0"
        style={{ backgroundColor: team.team_color ?? 'var(--color-neutral-400)' }}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-neutral-700">Ваша команда в этой смене</div>
        <div className="font-display text-heading-sm text-neutral-1000 flex items-center gap-2">
          {team.team_name}
          {isChampion && <Crown className="w-4 h-4 text-warning" aria-label="Победитель" />}
        </div>
      </div>
    </div>
  );
}

function RosterCard({
  roster,
  isChampion,
  viewerUserId,
}: {
  roster: SeasonRoster;
  isChampion: boolean;
  viewerUserId: string | null;
}) {
  return (
    <Card
      className={isChampion ? 'border-warning/60' : undefined}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-3.5 h-3.5 rounded-full border border-glass flex-shrink-0"
          style={{ backgroundColor: roster.team_color ?? 'var(--color-neutral-400)' }}
          aria-hidden
        />
        <h3 className="font-display text-sm text-neutral-1000 truncate">{roster.team_name}</h3>
        {isChampion && <Crown className="w-3.5 h-3.5 text-warning flex-shrink-0" aria-label="Победитель" />}
        <span className="ml-auto text-xs text-neutral-700">{roster.members.length}</span>
      </div>
      <ul className="space-y-0.5">
        {roster.members.map((m) => {
          const isMe = viewerUserId !== null && m.user_id === viewerUserId;
          return (
            <li
              key={m.child_id}
              className={`text-sm truncate ${isMe ? 'text-brand-300 font-semibold' : 'text-neutral-900'}`}
            >
              {m.full_name}
              {isMe && <span className="text-xs text-brand-400"> · вы</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChampionBanner({ teams }: { teams: TeamInfo[] }) {
  const many = teams.length > 1;
  return (
    <div className="flex items-center gap-3 rounded-sm border border-warning/50 bg-warning-bg px-4 py-3">
      <Crown className="w-6 h-6 text-warning flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-warning-text/80">
          {many ? 'Победители смены' : 'Победитель смены'}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
          {teams.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5 font-display text-heading-sm text-neutral-1000">
              <span
                className="w-3.5 h-3.5 rounded-full border border-glass"
                style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                aria-hidden
              />
              {t.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SeasonMap({
  sectors,
  teamsById,
}: {
  sectors: Sector[];
  teamsById: Record<string, TeamInfo>;
}) {
  const { minX, minY, maxX, maxY } = bbox(sectors, MAP_HEX_SIZE);
  const vbW = maxX - minX + MAP_VIEWBOX_PADDING * 2;
  const vbH = maxY - minY + MAP_VIEWBOX_PADDING * 2;
  return (
    <div
      className="relative w-full mx-auto"
      style={{ aspectRatio: `${vbW} / ${vbH}`, maxHeight: '78vh' }}
    >
      <div className="absolute inset-0">
        <HexMap sectors={sectors} teamsById={teamsById} />
      </div>
    </div>
  );
}
