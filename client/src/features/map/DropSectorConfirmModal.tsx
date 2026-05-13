import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  dropSubmission,
  type DropSubmissionResponse,
} from '../admin/submissions-api';

type Props = {
  submissionId: string;
  sectorLabel: string;
  influencePenalty: number;
  experiencePenalty: number;
  onCancel: () => void;
  onDropped: (result: DropSubmissionResponse) => void;
};

export function DropSectorConfirmModal({
  submissionId,
  sectorLabel,
  influencePenalty,
  experiencePenalty,
  onCancel,
  onDropped,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await dropSubmission(submissionId);
      onDropped(result);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Не удалось сбросить сектор',
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-50 border border-neutral-400 rounded-md w-full max-w-md shadow-3 overflow-hidden"
      >
        <header className="flex items-center gap-3 px-5 py-4 bg-neutral-100 border-b border-neutral-300">
          <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xs bg-danger/20 border border-danger">
            <AlertTriangle className="w-5 h-5 text-danger-text" />
          </div>
          <h2 className="font-display text-heading-sm text-neutral-1000 flex-1 leading-tight">
            Сбросить сектор?
          </h2>
          {!busy && (
            <button
              type="button"
              onClick={onCancel}
              className="text-neutral-700 hover:text-neutral-1000 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <div className="p-5 space-y-4">
          <p className="text-sm text-neutral-900">
            Команда отказывается от сектора{' '}
            <span className="font-display text-neutral-1000">{sectorLabel}</span>.
            Текущая заявка будет закрыта, действие отменено.
          </p>

          <div className="border border-warning rounded-sm bg-warning-bg p-3 space-y-2">
            <div className="text-2xs uppercase tracking-wider text-warning-text">
              Штраф команды
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PenaltyTile label="Влияние" value={influencePenalty} />
              <PenaltyTile label="Опыт" value={experiencePenalty} />
            </div>
            <p className="text-xs text-neutral-700 leading-relaxed">
              Если штраф опыта понизит уровень — будет снято равное число
              случайных характеристик команды.
            </p>
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleConfirm()}
              disabled={busy}
              isLoading={busy}
            >
              Сбросить сектор
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PenaltyTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-xs border border-neutral-400 bg-neutral-100">
      <span className="text-2xs uppercase tracking-wider text-neutral-700 leading-none">
        {label}
      </span>
      <span className="font-display font-semibold text-xl text-danger-text tabular-nums leading-none">
        −{value}
      </span>
    </div>
  );
}
