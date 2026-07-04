import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import {
  approveSubmission,
  getPendingSubmissions,
  rejectSubmission,
  type SubmissionActionType,
  type TaskSubmissionWithDetails,
} from '../admin/submissions-api';
import { formatSectorLabel } from './types';

const ACTION_LABELS: Record<SubmissionActionType, string> = {
  capture: 'Захват',
  recapture: 'Перехват',
  fortify: 'Укрепление',
  remove_fortification: 'Снос укр.',
};

type Props = {
  /** Bumped by the parent after map mutations to force a refetch. */
  refreshKey?: number;
  /** Called after an approve/reject so the parent can reload the map. */
  onActed: () => void;
};

/**
 * Compact review queue shown to admins beside the map. Approve and reject are
 * single-click — no modal, no mandatory comment — so accepting sectors is fast.
 */
export function AdminReviewQueue({ refreshKey = 0, onActed }: Props) {
  const [items, setItems] = useState<TaskSubmissionWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getPendingSubmissions());
    } catch {
      setError('Не удалось загрузить очередь');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function act(id: string, decision: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      // No comment required for either decision — reject sends null.
      if (decision === 'approve') await approveSubmission(id, null);
      else await rejectSubmission(id, null);
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
      onActed();
    } catch {
      setError('Ошибка обработки заявки');
      void load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col bg-neutral-100 border border-neutral-400 rounded-sm overflow-hidden lg:max-h-[82vh]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-neutral-200 border-b border-neutral-400">
        <span className="font-display text-sm text-neutral-1000">
          Очередь проверки
          {items && items.length > 0 && (
            <span className="ml-1.5 text-xs text-neutral-700">({items.length})</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1 -mr-1 text-neutral-700 hover:text-neutral-1000 transition-colors"
          aria-label="Обновить очередь"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && (
          <p className="text-xs text-danger-text px-1">{error}</p>
        )}
        {items === null && !error && (
          <div className="flex items-center gap-2 text-xs text-neutral-700 px-1 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
            Загрузка...
          </div>
        )}
        {items !== null && items.length === 0 && (
          <p className="text-xs text-neutral-700 px-1 py-2">Заявок нет.</p>
        )}
        {items && items.length > 0 && (
          // Cards flow across the available width — one column in the narrow
          // side panel, several when the queue spans full width below the map.
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {items.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onApprove={() => void act(item.id, 'approve')}
                onReject={() => void act(item.id, 'reject')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: TaskSubmissionWithDetails;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const teamColor = item.team.color ?? 'var(--color-neutral-500)';
  return (
    <div className="bg-neutral-50 border border-neutral-400 rounded-sm p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-2xs font-mono min-w-0 max-w-full"
          style={{
            backgroundColor: `${teamColor}22`,
            border: `1px solid ${teamColor}`,
            color: 'var(--color-neutral-1000)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full inline-block flex-shrink-0"
            style={{ backgroundColor: teamColor }}
          />
          <span className="truncate">{item.team.name}</span>
        </span>
        <span className="text-2xs font-mono text-neutral-800">
          {formatSectorLabel(item.difficulty.slug, item.sector.number)}
        </span>
        <span className="px-1.5 py-0.5 rounded-xs text-2xs font-mono bg-brand-900 text-brand-100 border border-brand-700">
          {ACTION_LABELS[item.action_type]}
        </span>
      </div>

      {item.task && (
        <p className="text-xs text-neutral-900 leading-snug line-clamp-2" title={item.task.question}>
          {item.task.title}
        </p>
      )}

      <div className="flex gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xs text-xs font-medium bg-success-bg text-success-text border border-success/50 hover:bg-success/20 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Принять
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xs text-xs font-medium bg-danger-bg text-danger-text border border-danger/50 hover:bg-danger/20 transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          Отклонить
        </button>
      </div>
    </div>
  );
}
