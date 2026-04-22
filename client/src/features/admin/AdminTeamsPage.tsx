import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Trash2, UserMinus, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getTeams, getTeam } from '../team/api';
import { adminDeleteTeam, adminKickMember, adminUpdateTeam } from './teams-api';
import type { Team, TeamFullStats } from '../team/types';
import {
  teamColors,
  TEAM_COLOR_ORDER,
  findTeamColorByHex,
  type TeamColorKey,
} from '../../design-system/design-tokens';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; teams: TeamFullStats[] };

export function AdminTeamsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState<TeamFullStats | null>(null);
  const [deleting, setDeleting] = useState<TeamFullStats | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const list = await getTeams();
      const full = await Promise.all(list.map((t: Team) => getTeam(t.id)));
      setState({ status: 'ready', teams: full });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить команды',
      });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Команды</h1>
          <p className="text-sm text-neutral-700">Полное управление командами.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={state.status === 'loading'}>
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Обновить
          </span>
        </Button>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" /> Загрузка...
        </div>
      )}
      {state.status === 'error' && <ErrorBanner message={state.message} />}
      {state.status === 'ready' && state.teams.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-700">Команд пока нет.</p>
        </Card>
      )}

      {state.status === 'ready' && state.teams.length > 0 && (
        <div className="grid gap-3">
          {state.teams.map((t) => (
            <TeamRow
              key={t.id}
              team={t}
              onEdit={() => setEditing(t)}
              onDelete={() => setDeleting(t)}
              onKicked={() => void load()}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditTeamModal
          team={editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {deleting && (
        <DeleteTeamModal
          team={deleting}
          onCancel={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TeamRow({
  team,
  onEdit,
  onDelete,
  onKicked,
}: {
  team: TeamFullStats;
  onEdit: () => void;
  onDelete: () => void;
  onKicked: () => void;
}) {
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);

  async function handleKick(userId: string) {
    setKickBusy(userId);
    setKickError(null);
    try {
      await adminKickMember(team.id, userId);
      onKicked();
    } catch (err) {
      setKickError(err instanceof ApiError ? err.message : 'Не удалось исключить');
      setKickBusy(null);
    }
  }

  const swatchColor = team.color ?? 'var(--color-neutral-400)';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-1 h-10 self-stretch rounded-full flex-shrink-0"
            style={{ backgroundColor: swatchColor }}
          />
          <div className="min-w-0">
            <h2 className="font-display text-heading-sm text-neutral-1000 truncate">{team.name}</h2>
            <p className="text-xs text-neutral-700">
              уровень {team.level} · опыт {team.experience} · влияние {team.influence} · секторов{' '}
              {team.captured_sectors_count}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={onEdit}>
            <span className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Править
            </span>
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Удалить
            </span>
          </Button>
        </div>
      </div>

      {kickError && (
        <div className="mb-2">
          <ErrorBanner message={kickError} />
        </div>
      )}

      <div className="border-t border-neutral-400 pt-3">
        <p className="text-xs text-neutral-700 mb-2">Участники ({team.members.length})</p>
        <ul className="space-y-1">
          {team.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-1.5"
            >
              <div className="text-sm text-neutral-1000 truncate">
                {m.username}
                {m.team_role === 'captain' && (
                  <span className="ml-2 text-xs text-brand-300 font-display">Капитан</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleKick(m.id)}
                disabled={kickBusy !== null}
                className="text-xs text-danger-text hover:text-danger flex items-center gap-1 disabled:opacity-50"
                title="Исключить из команды"
              >
                {kickBusy === m.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserMinus className="w-3.5 h-3.5" />
                )}
                Исключить
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function EditTeamModal({
  team,
  onCancel,
  onSaved,
}: {
  team: TeamFullStats;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialColorKey = useMemo<TeamColorKey | null>(() => {
    const found = team.color ? findTeamColorByHex(team.color) : null;
    if (!found) return null;
    return (TEAM_COLOR_ORDER.find((k) => teamColors[k].base === found.base) ?? null) as
      | TeamColorKey
      | null;
  }, [team.color]);

  const [name, setName] = useState(team.name);
  const [colorKey, setColorKey] = useState<TeamColorKey | null>(initialColorKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Название не может быть пустым');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: { name?: string; color?: string | null } = {};
      if (trimmed !== team.name) patch.name = trimmed;
      const nextColor = colorKey ? teamColors[colorKey].base : null;
      if (nextColor !== team.color) patch.color = nextColor;
      if (Object.keys(patch).length === 0) {
        onCancel();
        return;
      }
      await adminUpdateTeam(team.id, patch);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-heading-sm text-neutral-1000">Править команду</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <div>
          <Label htmlFor="edit-team-name">Название</Label>
          <Input
            id="edit-team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            disabled={busy}
            autoFocus
          />
        </div>

        <div>
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {TEAM_COLOR_ORDER.map((key) => {
              const c = teamColors[key];
              const selected = colorKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColorKey(key)}
                  disabled={busy}
                  className={`w-8 h-8 rounded-full border-2 transition-all disabled:opacity-40 ${
                    selected ? 'border-neutral-1000 scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.base }}
                  aria-label={`Цвет ${key}`}
                />
              );
            })}
            <button
              type="button"
              onClick={() => setColorKey(null)}
              disabled={busy}
              className={`h-8 px-3 rounded-full border-2 text-xs transition-all disabled:opacity-40 ${
                colorKey === null
                  ? 'border-neutral-1000 text-neutral-1000'
                  : 'border-neutral-400 text-neutral-700 hover:border-neutral-600'
              }`}
            >
              Без цвета
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" isLoading={busy} disabled={busy}>
            Сохранить
          </Button>
        </div>
      </form>
    </div>
  );
}

function DeleteTeamModal({
  team,
  onCancel,
  onDeleted,
}: {
  team: TeamFullStats;
  onCancel: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await adminDeleteTeam(team.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-heading-sm text-neutral-1000">Удалить команду?</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-neutral-700 hover:text-neutral-1000 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="bg-danger-bg border border-danger text-danger-text text-sm px-3 py-2 rounded-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Команда <b>{team.name}</b> будет удалена со всей прогрессией. Сектора
            освободятся, участники останутся без команды. Действие необратимо.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} isLoading={busy} disabled={busy}>
            Удалить
          </Button>
        </div>
      </div>
    </div>
  );
}
