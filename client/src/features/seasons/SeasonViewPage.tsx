import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { HexMap, type TeamInfo, MAP_HEX_SIZE, MAP_VIEWBOX_PADDING } from '../map/HexMap';
import { bbox } from '../map/hex-utils';
import type { Sector } from '../map/types';
import { getSeasons, getSeasonMap, getSeasonTeams, type Season } from './api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; season: Season; sectors: Sector[]; teamsById: Record<string, TeamInfo> };

export function SeasonViewPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: 'loading' });
    try {
      const [seasons, sectors, teams] = await Promise.all([
        getSeasons(),
        getSeasonMap(id),
        getSeasonTeams(id),
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
      setState({ status: 'ready', season, sectors, teamsById });
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
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-heading-md text-neutral-1000 mb-1">
                {state.season.name}
              </h1>
              <p className="text-sm text-neutral-700">
                {state.season.status === 'active'
                  ? 'Активная смена — режим только для просмотра. Для игры перейдите на карту.'
                  : 'Архив смены — только просмотр.'}
              </p>
            </div>
            {state.season.status === 'active' && (
              <Link
                to="/map"
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-sm bg-brand-700 text-neutral-1000 hover:bg-brand-600 transition-colors"
              >
                <Play className="w-4 h-4" />
                Играть
              </Link>
            )}
          </div>

          {state.sectors.length === 0 ? (
            <Card>
              <p className="text-sm text-neutral-700">У этой смены ещё нет карты.</p>
            </Card>
          ) : (
            <SeasonMap sectors={state.sectors} teamsById={state.teamsById} />
          )}

          {Object.keys(state.teamsById).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {Object.values(state.teamsById).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-neutral-900">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-glass"
                    style={{ backgroundColor: t.color ?? 'var(--color-neutral-400)' }}
                    aria-hidden
                  />
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
