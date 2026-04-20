import { useEffect, useState } from 'react';
import { getSectorsMap } from './api';
import type { Sector } from './types';
import { HexMap, type TeamInfo } from './HexMap';
import { api, ApiError } from '../../shared/api/client';
import { Loader2 } from 'lucide-react';

type TeamDto = { id: string; name: string; color: string | null };

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; sectors: Sector[]; teamsById: Record<string, TeamInfo> };

export function MapPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSectorsMap(), api.get<TeamDto[]>('/teams')])
      .then(([sectors, teams]) => {
        if (cancelled) return;
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
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Не удалось загрузить карту';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Карта</h1>
      <p className="text-sm text-neutral-700 mb-6">
        Гексагональное поле
        {state.status === 'ready' ? ` — ${state.sectors.length} секторов.` : '.'}
      </p>

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
        <HexMap sectors={state.sectors} teamsById={state.teamsById} />
      )}
    </div>
  );
}
