import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HexMap, type TeamInfo } from '../map/HexMap';
import type { Sector } from '../map/types';
import { getTimelapse, type TimelapseData } from './timelapse-api';

/** Playback speeds, in events applied per second. */
const SPEEDS = [1, 2, 5, 10, 20];
const DEFAULT_SPEED = 5;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: TimelapseData };

export function TimelapsePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [playhead, setPlayhead] = useState(0); // number of events applied
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getTimelapse()
      .then((data) => {
        if (data.sectors.length === 0) {
          setState({ status: 'empty' });
          return;
        }
        setState({ status: 'ready', data });
        setPlayhead(0);
        setPlaying(data.events.length > 0);
      })
      .catch(() => setState({ status: 'error', message: 'Не удалось загрузить таймлапс' }));
  }, [isAdmin]);

  const total = state.status === 'ready' ? state.data.events.length : 0;

  // Drive playback: advance the playhead one event per tick, stop at the end.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || state.status !== 'ready') return;
    timer.current = setInterval(() => {
      setPlayhead((h) => {
        if (h >= total) {
          setPlaying(false);
          return h;
        }
        return h + 1;
      });
    }, 1000 / speed);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, total, state.status]);

  const teamsById = useMemo(() => {
    const map: Record<string, TeamInfo> = {};
    if (state.status !== 'ready') return map;
    const sorted = [...state.data.teams].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((t, i) => {
      map[t.id] = { id: t.id, name: t.name, index: i, color: t.color };
    });
    return map;
  }, [state]);

  // Board snapshot at the playhead: owner of each sector = team of its last
  // capture event before the playhead.
  const sectors = useMemo<Sector[]>(() => {
    if (state.status !== 'ready') return [];
    const owner = new Map<string, string>();
    for (let i = 0; i < playhead; i++) {
      const e = state.data.events[i];
      owner.set(e.sector_id, e.team_id);
    }
    return state.data.sectors.map((bs) => {
      const captured = owner.get(bs.id) ?? null;
      return {
        id: bs.id,
        number: bs.number,
        q: bs.q,
        r: bs.r,
        difficulty_id: '',
        task_id: null,
        status: captured ? 'captured' : 'free',
        captured_by_team_id: captured,
        capturing_by_team_id: null,
        capture_started_at: null,
        fortification_level: 0,
        is_home_base: bs.is_home_base,
        home_team_id: bs.is_home_base ? captured : null,
        current_action_type: null,
        is_special: false,
        difficulty: {
          id: '',
          name: bs.difficulty_slug,
          slug: bs.difficulty_slug,
          influence_reward: 0,
          experience_reward: 0,
        },
        active_submission_team_id: null,
      };
    });
  }, [state, playhead]);

  const restart = useCallback(() => {
    setPlayhead(0);
    setPlaying(true);
  }, []);

  const atEnd = playhead >= total;
  const currentAt =
    state.status === 'ready' && playhead > 0
      ? state.data.events[playhead - 1].at
      : null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-700">
        Доступно только администраторам.
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
          Загрузка таймлапса...
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex-1 flex items-center justify-center text-danger-text">{state.message}</div>
      )}
      {state.status === 'empty' && (
        <div className="flex-1 flex items-center justify-center text-neutral-700">Карта не сгенерирована.</div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <div className="w-full h-full max-h-[82vh] flex items-center justify-center">
              <HexMap sectors={sectors} teamsById={teamsById} />
            </div>
          </div>

          <div className="border-t border-neutral-300 bg-neutral-100 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (atEnd ? restart() : setPlaying((p) => !p))}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-brand-500 text-neutral-0 hover:bg-brand-600 transition-colors flex-shrink-0"
                aria-label={playing ? 'Пауза' : 'Играть'}
              >
                {atEnd ? <RotateCcw className="w-5 h-5" /> : playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              <input
                type="range"
                min={0}
                max={total}
                value={playhead}
                onChange={(e) => {
                  setPlaying(false);
                  setPlayhead(Number(e.target.value));
                }}
                className="flex-1 accent-brand-500"
                aria-label="Прокрутка таймлапса"
              />

              <span className="font-mono text-xs text-neutral-700 tabular-nums flex-shrink-0 w-24 text-right">
                {playhead} / {total}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-neutral-700">
              <span className="tabular-nums">
                {currentAt
                  ? new Date(currentAt).toLocaleString('ru-RU')
                  : 'Начало — карта пуста'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-600">Скорость:</span>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-0.5 rounded-xs border text-xs tabular-nums transition-colors ${
                      speed === s
                        ? 'bg-brand-500 text-neutral-0 border-brand-500'
                        : 'bg-neutral-50 text-neutral-800 border-neutral-400 hover:border-brand-500'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
