import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Eraser, Loader2, PieChart, RefreshCw } from 'lucide-react';
import { Button, Card, ErrorBanner, Input } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { AdminGuard, AdminPageHeader } from './AdminShell';
import { getTeam, getTeams } from '../team/api';
import type { TeamFullStats } from '../team/types';
import { splitProportionally } from './proportional-split';
import { applyProportionalAward, type AwardResource } from './awards-api';

const RESOURCE_LABEL: Record<AwardResource, string> = {
  influence: 'Влияние',
  experience: 'Опыт',
};

export function AdminAwardsPage() {
  return (
    <AdminGuard>
      <Awards />
    </AdminGuard>
  );
}

/** Parsed as an integer; empty and garbage both read as 0. */
function toInt(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function Awards() {
  const [teams, setTeams] = useState<TeamFullStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Raw input strings — kept as typed so a half-entered "1" is not fought over.
  const [points, setPoints] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<AwardResource, boolean>>({
    influence: true,
    experience: false,
  });
  const [totals, setTotals] = useState<Record<AwardResource, string>>({
    influence: '',
    experience: '',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await getTeams();
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const full = await Promise.all(sorted.map((t) => getTeam(t.id)));
      setTeams(full);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить команды');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!teams) return [];
    const scores = teams.map((t) => toInt(points[t.id] ?? ''));
    const influence = enabled.influence
      ? splitProportionally(scores, toInt(totals.influence))
      : scores.map(() => 0);
    const experience = enabled.experience
      ? splitProportionally(scores, toInt(totals.experience))
      : scores.map(() => 0);
    return teams.map((team, i) => ({
      team,
      points: scores[i],
      influence: influence[i],
      experience: experience[i],
    }));
  }, [teams, points, enabled, totals]);

  const pointsSum = rows.reduce((acc, r) => acc + r.points, 0);
  const anyResource = enabled.influence || enabled.experience;
  const canApply = anyResource && pointsSum > 0 && !busy && rows.length > 0;

  function setResource(resource: AwardResource, on: boolean) {
    setEnabled((prev) => ({ ...prev, [resource]: on }));
    setDone(null);
  }

  async function apply() {
    if (!teams) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const resources = (Object.keys(enabled) as AwardResource[]).filter((r) => enabled[r]);
      const result = await applyProportionalAward({
        resources,
        totals: Object.fromEntries(resources.map((r) => [r, toInt(totals[r])])),
        points: teams.map((t) => ({ team_id: t.id, points: toInt(points[t.id] ?? '') })),
      });
      setTeams(result.teams);
      const parts = resources.map(
        (r) =>
          `${RESOURCE_LABEL[r].toLowerCase()} ${result.shares.reduce((acc, s) => acc + s[r], 0)}`,
      );
      setDone(`Роздано: ${parts.join(', ')}. Команд: ${result.shares.length}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось раздать');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4">
      <AdminPageHeader
        title="Раздача по баллам"
        actions={
          <Button variant="secondary" className="text-xs" onClick={() => void load()}>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Обновить
            </span>
          </Button>
        }
      />

      <p className="text-sm text-neutral-700 mb-4">
        Проставьте командам баллы за конкурс, задайте общий фонд влияния и/или опыта — он
        разойдётся пропорционально баллам. Остаток от деления достаётся командам с наибольшей
        дробной частью, так что раздаётся ровно введённое число. Значения прибавляются к тому,
        что у команд уже есть.
      </p>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {done && (
        <div className="mb-4 bg-success-bg text-success-text text-sm px-3 py-2 rounded-sm border border-success/40 flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          {done}
        </div>
      )}

      <Card className="mb-4">
        <h2 className="label text-neutral-600 mb-3">Что распределяем</h2>
        <div className="space-y-2">
          {(['influence', 'experience'] as AwardResource[]).map((resource) => (
            <div key={resource} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-32 flex-shrink-0 text-sm text-neutral-1000 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled[resource]}
                  onChange={(e) => setResource(resource, e.target.checked)}
                  className="w-4 h-4 accent-brand-500"
                />
                {RESOURCE_LABEL[resource]}
              </label>
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                placeholder="общий фонд"
                value={totals[resource]}
                disabled={!enabled[resource]}
                onChange={(e) => {
                  const next = e.target.value;
                  setTotals((prev) => ({ ...prev, [resource]: next }));
                  setDone(null);
                }}
                className="max-w-[10rem]"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-700 mt-3">
          Отрицательный фонд отнимает — тем же пропорциональным делением.
        </p>
      </Card>

      {teams === null ? (
        <div className="flex items-center justify-center py-12 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-700">В активном сезоне нет команд.</p>
        </Card>
      ) : (
        <>
          <div className="border border-neutral-300 rounded-md overflow-x-auto bg-neutral-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-600 border-b border-neutral-300">
                  <th className="px-3 py-2 font-normal">Команда</th>
                  <th className="px-3 py-2 font-normal w-24">Баллы</th>
                  {enabled.influence && (
                    <th className="px-3 py-2 font-normal text-right">Влияние</th>
                  )}
                  {enabled.experience && <th className="px-3 py-2 font-normal text-right">Опыт</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-300">
                {rows.map(({ team, influence, experience }) => (
                  <tr key={team.id}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 border border-neutral-400"
                          style={{ backgroundColor: team.color ?? 'var(--color-neutral-400)' }}
                        />
                        <span className="text-neutral-1000 truncate">{team.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={points[team.id] ?? ''}
                        onChange={(e) => {
                          const next = e.target.value;
                          setPoints((prev) => ({ ...prev, [team.id]: next }));
                          setDone(null);
                        }}
                        className="py-1 text-sm"
                      />
                    </td>
                    {enabled.influence && (
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        <span className="text-neutral-600">{team.influence}</span>
                        <Delta value={influence} />
                      </td>
                    )}
                    {enabled.experience && (
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        <span className="text-neutral-600">{team.experience}</span>
                        <Delta value={experience} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <span className="text-xs text-neutral-700">
              Сумма баллов: <span className="font-mono text-neutral-1000">{pointsSum}</span>
              {pointsSum === 0 && ' — проставьте баллы хотя бы одной команде'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => {
                  setPoints({});
                  setDone(null);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <Eraser className="w-3.5 h-3.5" /> Сбросить баллы
                </span>
              </Button>
              <Button onClick={() => void apply()} disabled={!canApply} isLoading={busy}>
                <span className="inline-flex items-center gap-1">
                  <PieChart className="w-4 h-4" /> Раздать
                </span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-neutral-600 ml-2">+0</span>;
  return (
    <span className={`ml-2 ${value > 0 ? 'text-success-text' : 'text-danger-text'}`}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}
