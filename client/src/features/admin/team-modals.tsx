import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Sliders, UserMinus, UserPlus, X } from 'lucide-react';
import { Button, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getTeam, getTeams } from '../team/api';
import {
  adminAssignMember,
  adminDeleteTeam,
  adminKickMember,
  adminSetTeamResources,
  adminSetTeamStats,
  adminUpdateTeam,
  getRoster,
  type RosterMember,
} from './teams-api';
import type { StatName, TeamFullStats } from '../team/types';
import { teamColors, TEAM_COLOR_ORDER } from '../../design-system/design-tokens';

type TeamOption = { id: string; name: string };

/** A one-shot team chooser: fires onPick then resets to the placeholder. */
export function TeamPickerSelect({
  teams,
  disabled,
  placeholder,
  onPick,
}: {
  teams: TeamOption[];
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

/**
 * Everything about one team in a single overlay: roster (kick / move / add),
 * name & color, resources. Opened from the map by clicking a team card, so
 * the admin never leaves the field during the game.
 */
export function TeamManageModal({
  teamId,
  onClose,
  onChanged,
}: {
  teamId: string;
  onClose: () => void;
  /** Fired after every successful change so the caller can refresh the map. */
  onChanged: () => void;
}) {
  const [team, setTeam] = useState<TeamFullStats | null>(null);
  const [others, setOthers] = useState<TeamOption[]>([]);
  const [takenColors, setTakenColors] = useState<ReadonlySet<string>>(new Set());
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [sub, setSub] = useState<'edit' | 'tune' | 'add' | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, list, fullRoster] = await Promise.all([
        getTeam(teamId),
        getTeams(),
        getRoster(),
      ]);
      setTeam(t);
      setOthers(list.filter((x) => x.id !== teamId));
      setTakenColors(
        new Set(
          list
            .filter((x) => x.id !== teamId && x.color)
            .map((x) => (x.color as string).toUpperCase()),
        ),
      );
      setRoster(fullRoster);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить команду');
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  async function handleMove(userId: string, targetTeamId: string) {
    setMemberBusy(userId);
    setMemberError(null);
    try {
      await adminAssignMember(targetTeamId, userId);
      await changed();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : 'Не удалось перевести');
    } finally {
      setMemberBusy(null);
    }
  }

  async function handleKick(userId: string) {
    setMemberBusy(userId);
    setMemberError(null);
    try {
      await adminKickMember(teamId, userId);
      await changed();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : 'Не удалось исключить');
    } finally {
      setMemberBusy(null);
    }
  }

  const swatch = team?.color ?? 'var(--color-neutral-400)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={memberBusy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-100 border border-neutral-400 rounded-md w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-3"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-neutral-300 sticky top-0 bg-neutral-100 z-10">
          <span
            aria-hidden
            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: swatch }}
          />
          <h2 className="font-display text-heading-sm text-neutral-1000 truncate flex-1">
            {team?.name ?? 'Команда'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -mr-1 text-neutral-700 hover:text-neutral-1000 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {loadError && <ErrorBanner message={loadError} />}
          {!team && !loadError && (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              Загрузка...
            </div>
          )}

          {team && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-700">
                <span>ур. {team.level}</span>
                <span>опыт {team.experience}</span>
                <span>влияние {team.influence}</span>
                <span>секторов {team.captured_sectors_count}</span>
                <span>очков {team.available_upgrade_points}</span>
              </div>
              <p className="text-2xs uppercase tracking-wider text-neutral-700 -mt-2">
                СИЛ {team.stats.strength} · ИНТ {team.stats.intelligence} · ВЫН{' '}
                {team.stats.endurance} · ЛИД {team.stats.leadership} · УД {team.stats.luck}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setSub('edit')}>
                  <span className="flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    Название и цвет
                  </span>
                </Button>
                <Button variant="secondary" onClick={() => setSub('tune')}>
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4" />
                    Ресурсы
                  </span>
                </Button>
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <div className="border-t border-neutral-400 pt-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-neutral-700">Состав ({team.members.length})</p>
                  <button
                    type="button"
                    onClick={() => setSub('add')}
                    className="text-xs text-brand-300 hover:text-brand-200 flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Добавить
                  </button>
                </div>
                {team.members.length === 0 && (
                  <p className="text-xs text-neutral-700 italic">Пока никого нет.</p>
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
                        {others.length > 0 && (
                          <TeamPickerSelect
                            teams={others}
                            disabled={memberBusy !== null}
                            placeholder="Перевести в…"
                            onPick={(targetId) => void handleMove(m.id, targetId)}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => void handleKick(m.id)}
                          disabled={memberBusy !== null}
                          className="text-xs text-danger-text hover:text-danger flex items-center gap-1 disabled:opacity-50"
                          title="Исключить из команды"
                        >
                          {memberBusy === m.id ? (
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
            </>
          )}
        </div>
      </div>

      {sub === 'edit' && team && (
        <EditTeamModal
          team={team}
          takenColors={takenColors}
          onCancel={() => setSub(null)}
          onSaved={async () => {
            setSub(null);
            await changed();
          }}
        />
      )}
      {sub === 'tune' && team && (
        <TuneTeamModal
          team={team}
          onCancel={() => setSub(null)}
          onSaved={async () => {
            setSub(null);
            await changed();
          }}
        />
      )}
      {sub === 'add' && team && (
        <AddMemberModal
          team={team}
          roster={roster}
          onCancel={() => setSub(null)}
          onAdded={async () => {
            setSub(null);
            await changed();
          }}
        />
      )}
    </div>
  );
}

/** Pick a child from the season roster and add/move them into `team`. */
export function AddMemberModal({
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
      onClick={busy ? undefined : (e) => { e.stopPropagation(); onCancel(); }}
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

export function EditTeamModal({
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
      onClick={busy ? undefined : (e) => { e.stopPropagation(); onCancel(); }}
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

export function DeleteTeamModal({
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

export function TuneTeamModal({
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

  function parseIntStrict(value: string, label: string): number {
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
        influence: parseIntStrict(influence, 'Влияние'),
        experience: parseIntStrict(experience, 'Опыт'),
        points: parseIntStrict(points, 'Очки апгрейда'),
        stats: {
          strength: parseIntStrict(stats.strength, 'Сила'),
          intelligence: parseIntStrict(stats.intelligence, 'Интеллект'),
          endurance: parseIntStrict(stats.endurance, 'Выносливость'),
          leadership: parseIntStrict(stats.leadership, 'Лидерство'),
          luck: parseIntStrict(stats.luck, 'Удача'),
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
      onClick={busy ? undefined : (e) => { e.stopPropagation(); onCancel(); }}
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
