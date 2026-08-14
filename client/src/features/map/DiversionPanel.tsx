import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bomb, Loader2, X } from 'lucide-react';
import {
  cancelDiversion,
  castDiversion,
  getDiversionCatalog,
  getDiversions,
  type Diversion,
  type DiversionDef,
  type DiversionKind,
} from '../admin/diversion-api';
import { formatSectorLabel, type DifficultySlug, type Sector } from './types';
import type { TeamFullStats } from '../team/types';
import { ApiError } from '../../shared/api/client';

type Props = {
  /** Команда, за которую играет председатель, — она и кидает диверсию. */
  casterTeam: TeamFullStats | null;
  teams: TeamFullStats[];
  sectors: Sector[];
  /** Вызывается после применения/снятия — родитель перезагружает карту. */
  onChanged: () => void;
};

/**
 * Диверсант прямо на карте: жетон диверсанта превращается в эффект здесь, а не
 * отыгрывается на словах. Мгновенные диверсии срабатывают сразу, «заряженные»
 * висят на команде-жертве и снимаются её следующим действием — они перечислены
 * ниже, чтобы председатель видел, кто под чем ходит.
 */
export function DiversionPanel({ casterTeam, teams, sectors, onChanged }: Props) {
  const [catalog, setCatalog] = useState<DiversionDef[]>([]);
  const [armed, setArmed] = useState<Diversion[]>([]);
  const [history, setHistory] = useState<Diversion[]>([]);
  const [kind, setKind] = useState<DiversionKind | ''>('');
  const [targetTeamId, setTargetTeamId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await getDiversions();
      setArmed(list.armed);
      setHistory(list.history);
    } catch {
      /* панель необязательная — молча переживаем сбой загрузки */
    }
  }, []);

  useEffect(() => {
    getDiversionCatalog()
      .then((r) => setCatalog(r.diversions))
      .catch(() => setCatalog([]));
    void reload();
  }, [reload]);

  const def = useMemo(
    () => catalog.find((d) => d.kind === kind) ?? null,
    [catalog, kind],
  );

  const tokens = casterTeam?.purchase_tokens.saboteur ?? 0;

  // Чужие укреплённые сектора — цели для «снятия укреплений».
  const fortified = useMemo(
    () =>
      sectors
        .filter(
          (s) =>
            s.fortification_level > 0 &&
            s.captured_by_team_id !== null &&
            s.captured_by_team_id !== casterTeam?.id,
        )
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [sectors, casterTeam],
  );

  const opponents = useMemo(
    () => teams.filter((t) => t.id !== casterTeam?.id),
    [teams, casterTeam],
  );

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [teams]);

  const ready =
    !!casterTeam &&
    !!def &&
    tokens > 0 &&
    (!def.needs_target || targetTeamId !== '') &&
    (!def.needs_sector || sectorId !== '');

  async function submit() {
    if (!casterTeam || !def) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await castDiversion({
        caster_team_id: casterTeam.id,
        kind: def.kind,
        target_team_id: def.needs_target ? targetTeamId : null,
        sector_id: def.needs_sector ? sectorId : null,
      });
      setNotice(
        result.status === 'applied'
          ? `«${result.title}» — ${result.note ?? 'применено'}`
          : `«${result.title}» заряжена на ${result.target_team_name ?? 'соперника'}`,
      );
      setKind('');
      setTargetTeamId('');
      setSectorId('');
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось применить диверсию');
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    setBusy(true);
    setError(null);
    try {
      await cancelDiversion(id);
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось снять диверсию');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-sm border border-danger/60 bg-danger-bg/40 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-danger/40">
        <Bomb className="w-3.5 h-3.5 text-danger-text" />
        <span className="font-display text-sm text-neutral-1000">Диверсии</span>
        {casterTeam && (
          <span className="ml-auto text-2xs text-neutral-700">
            жетоны: <b className="font-mono text-neutral-1000">{tokens}</b>
          </span>
        )}
      </div>

      <div className="p-2 space-y-2 text-xs">
        {!casterTeam ? (
          <p className="text-2xs text-neutral-700">
            Выберите команду, за которую играете, — диверсию кидает она.
          </p>
        ) : (
          <>
            <div className="text-2xs text-neutral-700">
              Кидает <b className="text-neutral-1000">{casterTeam.name}</b>
            </div>

            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as DiversionKind | '');
                setTargetTeamId('');
                setSectorId('');
              }}
              className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
            >
              <option value="">— выбрать диверсию —</option>
              {catalog.map((d) => (
                <option key={d.kind} value={d.kind}>
                  {d.title}
                </option>
              ))}
            </select>

            {def && <p className="text-2xs text-neutral-700">{def.description}</p>}

            {def?.needs_target && (
              <select
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
              >
                <option value="">— соперник —</option>
                {opponents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            {def?.needs_sector && (
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full px-1.5 py-1 rounded-sm bg-neutral-50 border border-neutral-500 text-neutral-1000"
              >
                <option value="">— укреплённый сектор —</option>
                {fortified.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSectorLabel(s.difficulty.slug as DifficultySlug, s.number)} ·{' '}
                    {teamNameById.get(s.captured_by_team_id ?? '') ?? '—'} · укр.{' '}
                    {s.fortification_level}
                  </option>
                ))}
              </select>
            )}

            {def?.needs_sector && fortified.length === 0 && (
              <p className="text-2xs text-neutral-600">Укреплённых чужих секторов нет.</p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ready || busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs text-2xs font-medium bg-danger-bg text-danger-text border border-danger/50 hover:bg-danger/20 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bomb className="w-3 h-3" />}
              Кинуть диверсию (−1 жетон)
            </button>

            {tokens === 0 && (
              <p className="text-2xs text-warning-text">
                У команды нет жетонов диверсанта — захватите сектор диверсанта.
              </p>
            )}
          </>
        )}

        {error && <p className="text-2xs text-danger-text">{error}</p>}
        {notice && <p className="text-2xs text-success-text">{notice}</p>}

        {armed.length > 0 && (
          <div className="border-t border-neutral-300 pt-2">
            <div className="text-2xs text-neutral-700 mb-1">Заряжены ({armed.length})</div>
            <ul className="space-y-1">
              {armed.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 rounded-xs bg-neutral-0/70 border border-neutral-300 px-2 py-1"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-2xs text-neutral-1000 truncate">{d.title}</div>
                    <div className="text-2xs text-neutral-700 truncate">
                      на {d.target_team_name ?? '—'} · от {d.caster_team_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void drop(d.id)}
                    disabled={busy}
                    title="Снять диверсию"
                    className="flex-shrink-0 p-1 rounded-xs text-neutral-700 hover:text-danger-text disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length > 0 && (
          <details className="border-t border-neutral-300 pt-2">
            <summary className="text-2xs text-neutral-700 cursor-pointer">
              Журнал ({history.length})
            </summary>
            <ul className="mt-1 space-y-1">
              {history.slice(0, 10).map((d) => (
                <li key={d.id} className="text-2xs text-neutral-700">
                  <span className="text-neutral-1000">{d.title}</span>
                  {d.target_team_name ? ` → ${d.target_team_name}` : ''}
                  {d.sector_number != null && d.sector_difficulty_slug
                    ? ` · ${formatSectorLabel(
                        d.sector_difficulty_slug as DifficultySlug,
                        d.sector_number,
                      )}`
                    : ''}
                  {d.status === 'cancelled' ? ' · снята' : ''}
                  {d.note ? ` · ${d.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
