import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Sliders, Trash2, UserMinus, UserPlus, RefreshCw } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getTeams, getTeam } from '../team/api';
import {
  adminAssignMember,
  adminKickMember,
  getUnassignedMembers,
  getRoster,
  type UnassignedMember,
  type RosterMember,
} from './teams-api';
import type { Team, TeamFullStats } from '../team/types';
import { AdminGuard, AdminPageHeader } from './AdminShell';
import {
  AddMemberModal,
  DeleteTeamModal,
  EditTeamModal,
  TeamPickerSelect,
  TuneTeamModal,
} from './team-modals';

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
  return (
    <AdminGuard>
      <TeamsManager />
    </AdminGuard>
  );
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
      <AdminPageHeader
        title="Команды"
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={state.status === 'loading'}>
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Обновить
            </span>
          </Button>
        }
      />

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
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="w-4 h-4 text-brand-400" />
        <h2 className="font-display text-heading-sm text-neutral-1000">Без команды ({members.length})</h2>
      </div>
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
