import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getSectorsMap } from '../map/api';
import type { Sector } from '../map/types';
import { HexMap, type TeamInfo } from '../map/HexMap';
import { computeMapLayout } from '../map/map-layout';
import { getTeams } from '../team/api';

/** How often the display refetches the board. */
const REFRESH_MS = 5000;

// Fixed design canvas. The board is laid out once at these dimensions and then
// scaled as a whole to the projector's screen, so nothing reflows, wraps or
// scrolls no matter the resolution (1024x768, 1280x800, 1920x1080 …).
// The projection shows the map alone — team stats stay off the wall.
const CANVAS_W = 1600;
const CANVAS_H = 900;
const PAD = 20;
const FOOTER_H = 26;
const MAP_BOX_W = CANVAS_W - PAD * 2;
const MAP_BOX_H = CANVAS_H - PAD * 2 - FOOTER_H;

/** Scale that fits the canvas inside the window, letterboxing the remainder. */
function useCanvasScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      sectors: Sector[];
      teamsById: Record<string, TeamInfo>;
      at: Date;
    };

export function AdminDisplayPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const scale = useCanvasScale();

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
      setState({ status: 'ready', sectors, teamsById, at: new Date() });
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

  // Only the viewbox is needed now that the side columns are gone.
  const mapLayout = useMemo(
    () => (state.status === 'ready' ? computeMapLayout(state.sectors, [], state.teamsById) : null),
    [state],
  );

  // Map drawn at its natural aspect, fitted to the fixed map box.
  const mapSize = useMemo(() => {
    if (!mapLayout) return null;
    const k = Math.min(MAP_BOX_W / mapLayout.vbW, MAP_BOX_H / mapLayout.vbH);
    return { w: mapLayout.vbW * k, h: mapLayout.vbH * k };
  }, [mapLayout]);

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
    <div className="fixed inset-0 overflow-hidden bg-neutral-50 text-neutral-900 flex items-center justify-center">
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          padding: PAD,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {state.status === 'loading' && (
          <div className="flex-1 flex items-center justify-center gap-3 text-neutral-700 text-2xl">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <span>Загрузка карты...</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex-1 flex items-center justify-center text-danger-text text-2xl">
            {state.message}
          </div>
        )}

        {state.status === 'empty' && (
          <div className="flex-1 flex items-center justify-center text-neutral-700 text-2xl">
            Карта не сгенерирована.
          </div>
        )}

        {state.status === 'ready' && mapLayout && mapSize && (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="relative" style={{ width: mapSize.w, height: mapSize.h }}>
              <HexMap sectors={state.sectors} teamsById={state.teamsById} />
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <div
            className="text-xs text-neutral-600 text-right flex items-end justify-end"
            style={{ height: FOOTER_H }}
          >
            Обновлено в {state.at.toLocaleTimeString('ru-RU')} · авто-обновление каждые{' '}
            {REFRESH_MS / 1000} с
          </div>
        )}
      </div>
    </div>
  );
}
