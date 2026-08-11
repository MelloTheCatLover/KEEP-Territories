import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  Crown,
  Gem,
  Sparkles,
  Landmark,
  Star,
  Flame,
  Swords,
  Trophy,
  Loader2,
  ChevronDown,
  ChevronRight,
  Pin,
  PinOff,
} from 'lucide-react';
import { Button, Card, ErrorBanner, Input } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/AuthContext';
import { getTrophies, getTrophyDetails, setTrophyWinner } from '../trophies/api';
import type {
  OverallEntry,
  TrophiesResponse,
  TrophyDetails,
  TrophyKey,
  TrophyRanking,
} from '../trophies/types';
import { teamPaletteFromColor } from '../../design-system/design-tokens';
import { AccessDenied, AdminPageHeader } from './AdminShell';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TrophiesResponse };

const ICON: Record<TrophyKey, ComponentType<{ className?: string }>> = {
  influential: Crown,
  core_keepers: Gem,
  experienced: Sparkles,
  rulers: Landmark,
  universal: Star,
  unbreakable: Flame,
  conquerors: Swords,
  champions: Trophy,
};

export function AdminTrophiesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    return getTrophies()
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        setState({
          status: 'error',
          message:
            err instanceof ApiError ? err.message : 'Не удалось загрузить кубки',
        });
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <AdminPageHeader title="Кубки" />

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          Загрузка...
        </div>
      )}

      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && (
        <>
          <OverallTable overall={state.data.overall} />
          <div className="space-y-4">
            {state.data.trophies.map((trophy) => (
              <TrophyTable
                key={trophy.key}
                trophy={trophy}
                onChanged={(data) => setState({ status: 'ready', data })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OverallTable({ overall }: { overall: OverallEntry[] }) {
  if (overall.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-5 h-5 text-brand-400" />
        <h2 className="font-display text-heading-sm text-neutral-1000">
          Общий зачёт
        </h2>
      </div>
      <p className="text-xs text-neutral-700 mb-3 leading-relaxed">
        Сначала по числу выигранных кубков (первых мест), при равенстве — по
        сумме мест команды по всем 8 кубкам (меньше — лучше). Ручное назначение
        победителя тоже считается выигранным кубком.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
              <th className="text-left py-2 pr-3 font-medium">Место</th>
              <th className="text-left py-2 pr-3 font-medium">Команда</th>
              <th className="text-right py-2 pr-3 font-medium">Кубков</th>
              <th className="text-right py-2 font-medium">Сумма мест</th>
            </tr>
          </thead>
          <tbody>
            {overall.map((row) => (
              <tr key={row.team_id} className="border-b border-neutral-300">
                <td className="py-2 pr-3 font-mono tabular-nums text-neutral-1000">
                  {row.place}
                </td>
                <td className="py-2 pr-3">
                  <TeamCell name={row.team_name} color={row.team_color} />
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-neutral-1000">
                  {row.trophies_won}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-neutral-1000">
                  {row.sum_of_places}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrophyTable({
  trophy,
  onChanged,
}: {
  trophy: TrophyRanking;
  onChanged: (data: TrophiesResponse) => void;
}) {
  const Icon = ICON[trophy.key];
  const [expanded, setExpanded] = useState(false);
  const overriddenName =
    trophy.entries.find((e) => e.team_id === trophy.override?.team_id)?.team_name ?? null;

  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <Icon className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-heading-sm text-neutral-1000">
            {trophy.name}
          </h2>
          <p className="text-xs text-neutral-700 mt-0.5">{trophy.description}</p>
          {trophy.private_value && (
            <p className="text-2xs uppercase tracking-wider text-warning-text mt-1">
              На карте показатель скрыт от чужих команд
            </p>
          )}
        </div>
      </div>

      {trophy.override && (
        <p className="text-xs text-warning-text bg-warning-bg border border-warning rounded-sm px-3 py-2 mb-3 flex items-start gap-2">
          <Pin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Победитель назначен вручную: <b>{overriddenName ?? '—'}</b>. Остальные
            места посчитаны по метрике и сдвинуты на позицию вниз.
            {trophy.override.note ? ` Причина: ${trophy.override.note}` : ''}
          </span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
              <th className="text-left py-2 pr-3 font-medium">Место</th>
              <th className="text-left py-2 pr-3 font-medium">Команда</th>
              <th className="text-right py-2 font-medium">Значение</th>
            </tr>
          </thead>
          <tbody>
            {trophy.entries.map((e) => (
              <tr key={e.team_id} className="border-b border-neutral-300">
                <td className="py-2 pr-3 font-mono tabular-nums text-neutral-1000">
                  {e.place}
                </td>
                <td className="py-2 pr-3">
                  <TeamCell name={e.team_name} color={e.team_color} />
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-neutral-1000">
                  {e.value ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WinnerOverride trophy={trophy} onChanged={onChanged} />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        Подробная статистика
      </button>
      {expanded && <TrophyDetailsPanel trophyKey={trophy.key} />}
    </Card>
  );
}

/** Ручное назначение победителя: выбор команды + причина, либо снятие. */
function WinnerOverride({
  trophy,
  onChanged,
}: {
  trophy: TrophyRanking;
  onChanged: (data: TrophiesResponse) => void;
}) {
  const [teamId, setTeamId] = useState(trophy.override?.team_id ?? '');
  const [note, setNote] = useState(trophy.override?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(nextTeamId: string | null) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await setTrophyWinner(trophy.key, nextTeamId, note || null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-neutral-300 pt-3 space-y-2">
      <p className="text-2xs uppercase tracking-wider text-neutral-700">
        Победитель вручную
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          disabled={busy}
          className="flex-1 min-w-0 bg-neutral-100 border border-neutral-400 rounded-sm px-2 py-1.5 text-sm text-neutral-1000"
        >
          <option value="">— по расчёту —</option>
          {trophy.entries.map((e) => (
            <option key={e.team_id} value={e.team_id}>
              {e.team_name}
            </option>
          ))}
        </select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Причина (необязательно)"
          disabled={busy}
          className="flex-1 min-w-0"
        />
        <div className="flex gap-2">
          <Button
            className="text-sm px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap"
            disabled={busy || teamId === ''}
            onClick={() => void apply(teamId)}
          >
            <Pin className="w-3.5 h-3.5" />
            Назначить
          </Button>
          {trophy.override && (
            <Button
              className="text-sm px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setTeamId('');
                setNote('');
                void apply(null);
              }}
            >
              <PinOff className="w-3.5 h-3.5" />
              Снять
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}

type DetailsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TrophyDetails };

function TrophyDetailsPanel({ trophyKey }: { trophyKey: TrophyKey }) {
  const [state, setState] = useState<DetailsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getTrophyDetails(trophyKey)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message:
            err instanceof ApiError ? err.message : 'Не удалось загрузить статистику',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [trophyKey]);

  if (state.status === 'loading') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-neutral-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
        Считаю...
      </div>
    );
  }
  if (state.status === 'error') {
    return <p className="mt-3 text-xs text-danger-text">{state.message}</p>;
  }

  const { data } = state;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-neutral-700 leading-relaxed bg-neutral-100 border border-neutral-300 rounded-sm px-3 py-2">
        {data.rule}
      </p>
      {data.teams.map((team) => (
        <TeamDetail key={team.team_id} team={team} valueLabel={data.value_label} />
      ))}
    </div>
  );
}

function TeamDetail({
  team,
  valueLabel,
}: {
  team: TrophyDetails['teams'][number];
  valueLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-neutral-300 rounded-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-neutral-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-neutral-700 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-700 flex-shrink-0" />
        )}
        <span className="font-mono tabular-nums text-neutral-700 text-xs w-6">
          {team.place}
        </span>
        <TeamCell name={team.team_name} color={team.team_color} />
        <span className="ml-auto font-mono tabular-nums text-sm text-neutral-1000">
          {valueLabel}: {team.value}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {team.breakdown.map((part) => (
              <span
                key={part.label}
                title={part.hint}
                className="inline-flex items-baseline gap-1.5 bg-neutral-100 border border-neutral-300 rounded-sm px-2 py-1 text-xs"
              >
                <span className="text-neutral-700">{part.label}</span>
                <span className="font-mono tabular-nums text-neutral-1000">
                  {part.value > 0 ? `+${part.value}` : part.value}
                </span>
              </span>
            ))}
          </div>

          {team.events.length === 0 ? (
            <p className="text-xs text-neutral-700">Событий нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-2xs uppercase tracking-wider text-neutral-700 border-b border-neutral-300">
                    <th className="text-left py-1.5 pr-3 font-medium">Когда</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Событие</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Детали</th>
                    <th className="text-right py-1.5 font-medium">Вклад</th>
                  </tr>
                </thead>
                <tbody>
                  {team.events.map((ev, i) => (
                    <tr
                      key={`${ev.kind}-${ev.at ?? 'now'}-${i}`}
                      className={`border-b border-neutral-300 ${
                        ev.kind === 'drop' ? 'text-danger-text' : 'text-neutral-900'
                      }`}
                    >
                      <td className="py-1.5 pr-3 font-mono tabular-nums whitespace-nowrap text-neutral-700">
                        {formatWhen(ev.at)}
                      </td>
                      <td className="py-1.5 pr-3">{ev.label}</td>
                      <td className="py-1.5 pr-3 text-neutral-700">{ev.detail}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {ev.value === null ? '—' : ev.value > 0 ? `+${ev.value}` : ev.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatWhen(at: string | null): string {
  if (at === null) return 'сейчас';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TeamCell({ name, color }: { name: string; color: string | null }) {
  const palette = teamPaletteFromColor(color);
  const fill = palette?.base ?? 'var(--color-neutral-500)';
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: fill }}
      />
      <span className="text-neutral-1000 truncate">{name}</span>
    </span>
  );
}
