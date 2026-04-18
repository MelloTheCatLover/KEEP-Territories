import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { difficultyColors } from '../../design-system/design-tokens';
import {
  approveSubmission,
  getPendingSubmissions,
  type SubmissionActionType,
  type TaskSubmissionWithDetails,
} from './submissions-api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: TaskSubmissionWithDetails[] };

const ACTION_LABELS: Record<SubmissionActionType, string> = {
  capture: 'Захват',
  recapture: 'Перехват',
  fortify: 'Укрепление',
  remove_fortification: 'Снос укрепления',
};

function formatCoord(q: number, r: number): string {
  return `(${q}, ${r})`;
}

export function AdminSubmissionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [modalFor, setModalFor] = useState<TaskSubmissionWithDetails | null>(null);
  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const items = await getPendingSubmissions();
      setState({ status: 'ready', items });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить очередь';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  function openApproveModal(item: TaskSubmissionWithDetails) {
    setModalFor(item);
    setComment('');
    setActionError(null);
  }

  function closeModal() {
    setModalFor(null);
    setComment('');
  }

  async function handleConfirmApprove() {
    if (!modalFor) return;
    setApprovingId(modalFor.id);
    setActionError(null);
    try {
      await approveSubmission(modalFor.id, comment.trim() || null);
      setFlash(`Заявка по сектору #${modalFor.sector.number} подтверждена`);
      closeModal();
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка подтверждения');
    } finally {
      setApprovingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">
                Доступ запрещён
              </h1>
              <p className="text-sm text-neutral-700">
                Эта страница доступна только администраторам.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">
            Админ — очередь проверки
          </h1>
          <p className="text-sm text-neutral-700">
            Активные заявки команд. Подтверждение применяет эффект на карте.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void refresh()}
          disabled={state.status === 'loading'}
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Обновить
          </span>
        </Button>
      </div>

      {flash && (
        <div className="bg-success-bg text-success-text text-sm px-3 py-2 rounded-sm border border-success/40 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {flash}
        </div>
      )}
      {actionError && <ErrorBanner message={actionError} />}

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка очереди...</span>
        </div>
      )}
      {state.status === 'error' && <ErrorBanner message={state.message} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-700">
            Пока нет заявок на рассмотрении.
          </p>
        </Card>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <div className="space-y-3">
          {state.items.map((item) => (
            <SubmissionRow
              key={item.id}
              item={item}
              busy={approvingId === item.id}
              onApprove={() => openApproveModal(item)}
            />
          ))}
        </div>
      )}

      {modalFor && (
        <ApproveModal
          item={modalFor}
          comment={comment}
          onChangeComment={setComment}
          onClose={closeModal}
          onConfirm={() => void handleConfirmApprove()}
          isBusy={approvingId === modalFor.id}
        />
      )}
    </div>
  );
}

type RowProps = {
  item: TaskSubmissionWithDetails;
  busy: boolean;
  onApprove: () => void;
};

function SubmissionRow({ item, busy, onApprove }: RowProps) {
  const diffColor = difficultyColors[item.difficulty.slug];
  const teamChipColor = item.team.color ?? 'var(--color-neutral-500)';

  return (
    <Card>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 px-2 py-1 rounded-sm text-xs font-mono"
              style={{
                backgroundColor: `${teamChipColor}22`,
                color: 'var(--color-neutral-1000)',
                border: `1px solid ${teamChipColor}`,
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: teamChipColor }}
              />
              {item.team.name}
            </span>
            <span className="text-xs font-mono text-neutral-800">
              #{item.sector.number} {formatCoord(item.sector.q, item.sector.r)}
            </span>
            <span
              className="px-2 py-0.5 rounded-sm text-xs font-mono"
              style={{
                backgroundColor: `${diffColor}22`,
                color: 'var(--color-neutral-1000)',
                border: `1px solid ${diffColor}`,
              }}
            >
              {item.difficulty.name}
            </span>
            <span className="px-2 py-0.5 rounded-sm text-xs font-mono bg-brand-900 text-brand-100 border border-brand-700">
              {ACTION_LABELS[item.action_type]}
            </span>
          </div>

          {item.task ? (
            <div>
              <h3 className="text-sm font-semibold text-neutral-1000 mb-1">
                {item.task.title}
              </h3>
              <p className="text-sm text-neutral-800 whitespace-pre-wrap">
                {item.task.question}
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-700 italic">Без задания</p>
          )}

          <p className="text-xs text-neutral-700">
            От: <span className="font-mono text-neutral-900">{item.user.username}</span>
            {' · '}
            {new Date(item.created_at).toLocaleString('ru-RU')}
          </p>
        </div>

        <div className="flex md:flex-col gap-2 md:items-stretch">
          <Button variant="primary" onClick={onApprove} isLoading={busy} disabled={busy}>
            Подтвердить
          </Button>
        </div>
      </div>
    </Card>
  );
}

type ModalProps = {
  item: TaskSubmissionWithDetails;
  comment: string;
  onChangeComment: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isBusy: boolean;
};

function ApproveModal({
  item,
  comment,
  onChangeComment,
  onClose,
  onConfirm,
  isBusy,
}: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={onClose}
    >
      <div
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
          Подтвердить заявку
        </h2>
        <p className="text-xs text-neutral-700 mb-4">
          {ACTION_LABELS[item.action_type]} · сектор #{item.sector.number} · {item.team.name}
        </p>

        <label className="block text-xs text-neutral-800 mb-1">
          Комментарий (необязательно)
        </label>
        <textarea
          value={comment}
          onChange={(e) => onChangeComment(e.target.value)}
          rows={3}
          className="w-full bg-neutral-50 border border-neutral-400 rounded-sm px-2 py-1 text-sm text-neutral-1000 focus:outline-none focus:border-brand-500"
          placeholder="Например: принято по видеозаписи"
        />

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Отмена
          </Button>
          <Button variant="primary" onClick={onConfirm} isLoading={isBusy}>
            Подтвердить
          </Button>
        </div>
      </div>
    </div>
  );
}
