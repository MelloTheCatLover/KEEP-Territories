import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Sliders, Trash2, UserMinus, UserPlus, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getTeams, getTeam } from '../team/api';
import {
  adminAssignMember,
  adminDeleteTeam,
  adminKickMember,
  adminSetTeamResources,
  adminSetTeamStats,
  adminUpdateTeam,
  getUnassignedMembers,
  getRoster,
  type UnassignedMember,
  type RosterMember,
} from './teams-api';
import type { StatName, Team, TeamFullStats } from '../team/types';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      teams: TeamFullStats[];
      unassigned: UnassignedMember[];
      roster: RosterMember[];
    };

/** Admin route wrapper — guards access, then renders the shared manager. */
export function AdminTeamsPage() {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
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
  return <TeamsManager />;
}

/**
 * Full admin team + roster management. Shown both at /admin/teams and on the
 * /team page for admins (who never join a team themselves).
 */
export function TeamsManager() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState<TeamFullStats | null>(null);
  const [deleting, setDeleting] = useState<TeamFullStats | null>(null);
  const [tuning, setTuning] = useState<TeamFullStats | null>(null);
  const [addingTo, setAddingTo] = useState<TeamFullStats | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [list, unassigned, roster] = await Promise.all([
        getTeams(),
        getUnassignedMembers(),
        getRoster(),
      ]);
      const full = await Promise.all(list.map((t: Team) => getTeam(t.id)));
      setState({ status: 'ready', teams: full, unassigned, roster });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить команды',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Команды</h1>
          <p className="text-sm text-neutral-700">Управление командами и их составами.</p>
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

      {state.status === 'ready' && (
        <UnassignedCard
          members={state.unassigned}
          teams={state.teams}
          onChanged={() => void load()}
        />
      )}

      {state.status === 'ready' && state.teams.length > 0 && (
        <div className="grid gap-3">
          {state.teams.map((t) => (
            <TeamRow
              key={t.id}
              team={t}
              allTeams={state.teams}
              onEdit={() => setEditing(t)}
              onTune={() => setTuning(t)}
              onDelete={() => setDeleting(t)}
              onAdd={() => setAddingTo(t)}
              onKicked={() => void load()}
            />
          ))}
        </div>
      )}

      {editing && state.status === 'ready' && (
        <EditTeamModal
          team={editing}
          takenColors={
            new Set(
              state.teams
                .filter((t) => t.id !== editing.id && t.color)
                .map((t) => (t.color as string).toUpperCase()),
            )
          }
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

      {tuning && (
        <TuneTeamModal
          team={tuning}
          onCancel={() => setTuning(null)}
          onSaved={async () => {
            setTuning(null);
            await load();
          }}
        />
      )}

      {addingTo && state.status === 'ready' && (
        <AddMemberModal
          team={addingTo}
          roster={state.roster}
          onCancel={() => setAddingTo(null)}
          onAdded={async () => {
            setAddingTo(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TeamRow({
  team,
  allTeams,
  onEdit,
  onTune,
  onDelete,
  onAdd,
  onKicked,
}: {
  team: TeamFullStats;
  allTeams: TeamFullStats[];
  onEdit: () => void;
  onTune: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onKicked: () => void;
}) {
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const otherTeams = allTeams.filter((t) => t.id !== team.id);

  async function handleMove(userId: string, targetTeamId: string) {
    setKickBusy(userId);
    setKickError(null);
    try {
      await adminAssignMember(targetTeamId, userId);
      onKicked();
    } catch (err) {
      setKickError(err instanceof ApiError ? err.message : 'Не удалось перевести');
      setKickBusy(null);
    }
  }

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
      <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-1 self-stretch min-h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: swatchColor }}
          />
          <div className="min-w-0">
            <h2 className="font-display text-heading-sm text-neutral-1000 truncate">{team.name}</h2>
            <p className="text-xs text-neutral-700">
              ур. {team.level} · опыт {team.experience} · влияние {team.influence} ·
              секторов {team.captured_sectors_count} · очков {team.available_upgrade_points}
            </p>
            <p className="text-2xs uppercase tracking-wider text-neutral-700 mt-1">
              СИЛ {team.stats.strength} · ИНТ {team.stats.intelligence} · ВЫН{' '}
              {team.stats.endurance} · ЛИД {team.stats.leadership} · УД {team.stats.luck}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
          <Button variant="secondary" onClick={onEdit}>
            <span className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Править
            </span>
          </Button>
          <Button variant="secondary" onClick={onTune}>
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Ресурсы
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
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs text-neutral-700">Участники ({team.members.length})</p>
          <button
            type="button"
            onClick={onAdd}
            className="text-xs text-brand-300 hover:text-brand-200 flex items-center gap-1"
            title="Добавить участника из списка"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Добавить из списка
          </button>
        </div>
        {team.members.length === 0 && (
          <p className="text-xs text-neutral-700 italic mb-1">Пока никого нет.</p>
        )}
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
              <div className="flex items-center gap-3 flex-shrink-0">
                {otherTeams.length > 0 && (
                  <TeamPickerSelect
                    teams={otherTeams}
                    disabled={kickBusy !== null}
                    placeholder="Перевести в…"
                    onPick={(targetId) => void handleMove(m.id, targetId)}
                  />
                )}
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
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** A one-shot team chooser: fires onPick then resets to the placeholder. */
function TeamPickerSelect({
  teams,
  disabled,
  placeholder,
  onPick,
}: {
  teams: TeamFullStats[];
  disabled?: boolean;
  placeholder: string;
  onPick: (teamId: string) => void;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        const id = e.target.value;
        if (id) onPick(id);
        e.target.value = '';
      }}
      className="text-xs bg-neutral-100 border border-neutral-400 rounded-sm px-2 py-1 text-neutral-1000 disabled:opacity-50 max-w-[10rem]"
    >
      <option value="">{placeholder}</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

/** Enrolled kids not in any team (e.g. after a kick) — placeable into a team. */
function UnassignedCard({
  members,
  teams,
  onChanged,
}: {
  members: UnassignedMember[];
  teams: TeamFullStats[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0) return null;

  async function handleAssign(userId: string, teamId: string) {
    setBusy(userId);
    setError(null);
    try {
      await adminAssignMember(teamId, userId);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить в команду');
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <UserPlus className="w-4 h-4 text-brand-400" />
        <h2 className="font-display text-heading-sm text-neutral-1000">Без команды ({members.length})</h2>
      </div>
      <p className="text-xs text-neutral-700 mb-3">
        Участники сезона без команды. Выберите команду, чтобы добавить.
      </p>
      {error && (
        <div className="mb-2">
          <ErrorBanner message={error} />
        </div>
      )}
      {teams.length === 0 ? (
        <p className="text-sm text-neutral-700">Сначала создайте команду.</p>
      ) : (
        <ul className="space-y-1">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-1.5"
            >
              <div className="text-sm text-neutral-1000 truncate">
                {m.full_name ?? m.username}
                {busy === m.id && <Loader2 className="inline w-3.5 h-3.5 animate-spin ml-2" />}
              </div>
              <TeamPickerSelect
                teams={teams}
                disabled={busy !== null}
                placeholder="В команду…"
                onPick={(teamId) => void handleAssign(m.id, teamId)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Pick a child from the season roster and add/move them into `team`. */
function AddMemberModal({
  team,
  roster,
  onCancel,
  onAdded,
}: {
  team: TeamFullStats;
  roster: RosterMember[];
  onCancel: () => void;
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const candidates = roster
    .filter((r) => r.team_id !== team.id)
    .filter((r) => q === '' || (r.full_name ?? '').toLowerCase().includes(q))
    // Placeable first (has account & no team), then others; alphabetical within.
    .sort((a, b) => {
      const rank = (r: RosterMember) => (r.has_account ? (r.team_id ? 1 : 0) : 2);
      return rank(a) - rank(b) || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ru');
    });

  async function handleAdd(r: RosterMember) {
    if (!r.user_id) return;
    setBusy(r.child_id);
    setError(null);
    try {
      await adminAssignMember(team.id, r.user_id);
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить');
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-heading-sm text-neutral-1000">
            В команду «{team.name}»
          </h2>
          <button type="button" onClick={onCancel} className="text-neutral-700 hover:text-neutral-1000" title="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени..."
          autoFocus
        />

        {candidates.length === 0 ? (
          <p className="text-sm text-neutral-700">Никого не найдено.</p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((r) => {
              const inTeam = r.team_id !== null;
              return (
                <li
                  key={r.child_id}
                  className="flex items-center justify-between gap-3 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-1000 truncate">{r.full_name ?? '—'}</div>
                    <div className="text-2xs text-neutral-700 truncate">
                      {!r.has_account
                        ? 'нет аккаунта'
                        : inTeam
                          ? `в команде «${r.team_name}»`
                          : 'без команды'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAdd(r)}
                    disabled={!r.has_account || busy !== null}
                    className="text-xs text-brand-300 hover:text-brand-200 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    title={!r.has_account ? 'Сначала выдайте аккаунт' : inTeam ? 'Перевести сюда' : 'Добавить'}
                  >
                    {busy === r.child_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    {inTeam ? 'Перевести' : 'Добавить'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditTeamModal({
  team,
  takenColors,
  onCancel,
  onSaved,
}: {
  team: TeamFullStats;
  takenColors: ReadonlySet<string>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState<string | null>(team.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedColor = color ? color.toUpperCase() : null;
  const isValidColor = normalizedColor === null || /^#[0-9A-F]{6}$/.test(normalizedColor);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Название не может быть пустым');
      return;
    }
    if (!isValidColor) {
      setError('Цвет должен быть в формате #RRGGBB');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: { name?: string; color?: string | null } = {};
      if (trimmed !== team.name) patch.name = trimmed;
      if (normalizedColor !== team.color) patch.color = normalizedColor;
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
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3 space-y-4"
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
          <div className="flex items-center gap-3 mt-2">
            <input
              type="color"
              value={normalizedColor ?? '#888888'}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              disabled={busy}
              className="w-10 h-10 rounded-sm border border-neutral-400 bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Выбрать цвет"
              title="Выбрать любой цвет"
            />
            <input
              type="text"
              value={color ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setColor(v === '' ? null : v.toUpperCase());
              }}
              placeholder="#RRGGBB"
              maxLength={7}
              disabled={busy}
              className="font-mono w-28 px-2 py-1.5 rounded-sm bg-neutral-100 border border-neutral-500 text-neutral-1000 text-sm focus:outline-none focus:border-brand-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setColor(null)}
              disabled={busy}
              className={`h-8 px-3 rounded-full border-2 text-xs transition-all disabled:opacity-40 ${
                normalizedColor === null
                  ? 'border-neutral-1000 text-neutral-1000'
                  : 'border-neutral-400 text-neutral-700 hover:border-neutral-600'
              }`}
            >
              Без цвета
            </button>
          </div>
          {!isValidColor && (
            <p className="text-xs text-danger-text mt-1">Формат: #RRGGBB</p>
          )}

          <div className="text-2xs uppercase tracking-wider text-neutral-700 mt-3 mb-1.5">
            Палитра
          </div>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLOR_ORDER.map((key) => {
              const c = teamColors[key];
              const selected = normalizedColor === c.base.toUpperCase();
              const taken = !selected && takenColors.has(c.base.toUpperCase());
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !taken && setColor(c.base.toUpperCase())}
                  disabled={busy || taken}
                  className={`relative w-8 h-8 rounded-full border-2 transition-all disabled:cursor-not-allowed ${
                    taken
                      ? 'border-transparent opacity-30'
                      : selected
                      ? 'border-neutral-1000 scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.base }}
                  title={taken ? `${key} — занят` : key}
                  aria-label={taken ? `Цвет ${key} занят` : `Цвет ${key}`}
                >
                  {taken && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-neutral-1000 text-xs leading-none"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
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
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3 space-y-4"
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

const STAT_FIELDS: Array<{ key: StatName; label: string }> = [
  { key: 'strength', label: 'Сила' },
  { key: 'intelligence', label: 'Интеллект' },
  { key: 'endurance', label: 'Выносливость' },
  { key: 'leadership', label: 'Лидерство' },
  { key: 'luck', label: 'Удача' },
];

function TuneTeamModal({
  team,
  onCancel,
  onSaved,
}: {
  team: TeamFullStats;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [influence, setInfluence] = useState(String(team.influence));
  const [experience, setExperience] = useState(String(team.experience));
  const [points, setPoints] = useState(String(team.available_upgrade_points));
  const [stats, setStats] = useState<Record<StatName, string>>({
    strength: String(team.stats.strength),
    intelligence: String(team.stats.intelligence),
    endurance: String(team.stats.endurance),
    leadership: String(team.stats.leadership),
    luck: String(team.stats.luck),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseInt(value: string, label: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(`${label}: целое число ≥ 0`);
    }
    return n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let parsed: {
      influence: number;
      experience: number;
      points: number;
      stats: Record<StatName, number>;
    };
    try {
      parsed = {
        influence: parseInt(influence, 'Влияние'),
        experience: parseInt(experience, 'Опыт'),
        points: parseInt(points, 'Очки апгрейда'),
        stats: {
          strength: parseInt(stats.strength, 'Сила'),
          intelligence: parseInt(stats.intelligence, 'Интеллект'),
          endurance: parseInt(stats.endurance, 'Выносливость'),
          leadership: parseInt(stats.leadership, 'Лидерство'),
          luck: parseInt(stats.luck, 'Удача'),
        },
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Некорректные значения');
      return;
    }

    setBusy(true);
    try {
      const resourcesPatch: {
        influence?: number;
        experience?: number;
        upgrade_points?: number;
      } = {};
      if (parsed.influence !== team.influence) resourcesPatch.influence = parsed.influence;
      if (parsed.experience !== team.experience)
        resourcesPatch.experience = parsed.experience;
      if (parsed.points !== team.available_upgrade_points)
        resourcesPatch.upgrade_points = parsed.points;

      const statsPatch: Partial<Record<StatName, number>> = {};
      for (const { key } of STAT_FIELDS) {
        if (parsed.stats[key] !== team.stats[key]) statsPatch[key] = parsed.stats[key];
      }

      if (Object.keys(resourcesPatch).length > 0) {
        await adminSetTeamResources(team.id, resourcesPatch);
      }
      if (Object.keys(statsPatch).length > 0) {
        await adminSetTeamStats(team.id, statsPatch);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
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
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-3 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-sm text-neutral-1000">
              Ресурсы команды
            </h2>
            <p className="text-xs text-neutral-700 mt-0.5 truncate">{team.name}</p>
          </div>
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
          <h3 className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
            Ресурсы
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumField label="Влияние" value={influence} onChange={setInfluence} disabled={busy} />
            <NumField label="Опыт" value={experience} onChange={setExperience} disabled={busy} />
            <NumField
              label="Очки апгрейда"
              value={points}
              onChange={setPoints}
              disabled={busy}
            />
          </div>
          <p className="text-2xs text-neutral-700 mt-2 leading-relaxed">
            Базовые расчёты остаются прежними; разница записывается в `team_adjustments`.
            Изменение опыта пересчитывает уровень.
          </p>
        </div>

        <div>
          <h3 className="text-2xs uppercase tracking-wider text-neutral-700 mb-2">
            Характеристики
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {STAT_FIELDS.map((f) => (
              <NumField
                key={f.key}
                label={f.label}
                value={stats[f.key]}
                onChange={(v) => setStats((prev) => ({ ...prev, [f.key]: v }))}
                disabled={busy}
              />
            ))}
          </div>
          <p className="text-2xs text-neutral-700 mt-2 leading-relaxed">
            Каждая стата = число строк в `team_stat_upgrades`. Сервер делает DELETE+INSERT
            по затронутым статам.
          </p>
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

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
