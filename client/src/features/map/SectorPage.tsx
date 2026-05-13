import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2, Trash2 } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getCurrentSubmission, getSectorById } from './api';
import type { Sector } from './types';
import { formatSectorLabel } from './types';
import type { TaskSubmissionWithDetails } from '../admin/submissions-api';
import { DropSectorConfirmModal } from './DropSectorConfirmModal';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      sector: Sector;
      submission: TaskSubmissionWithDetails | null;
    };

const ACTION_LABELS: Record<string, string> = {
  capture: 'Захват',
  recapture: 'Перехват',
  fortify: 'Укрепление',
  remove_fortification: 'Снятие укрепления',
};

export function SectorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: 'loading' });
    try {
      const [sector, submission] = await Promise.all([
        getSectorById(id),
        getCurrentSubmission(id),
      ]);
      setState({ status: 'ready', sector, submission });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить сектор';
      setState({ status: 'error', message });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return <div className="max-w-3xl mx-auto px-4 text-danger-text">Нет id сектора</div>;
  }

  if (state.status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 flex items-center gap-3 text-neutral-700">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        Загрузка...
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-4 space-y-4">
        <BackLink />
        <ErrorBanner message={state.message} />
      </div>
    );
  }

  const { sector, submission } = state;
  const label = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-4">
      <BackLink />

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-heading-md text-neutral-1000 mb-1">
              Сектор {label}
            </h1>
            <p className="text-sm text-neutral-700">
              {sector.difficulty.name} · координаты ({sector.q}, {sector.r}) · статус{' '}
              <span className="text-neutral-1000">{sector.status}</span>
              {sector.fortification_level > 0 && ` · укр. ${sector.fortification_level}`}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            Обновить
          </Button>
        </div>
      </Card>

      {!submission && (
        <Card>
          <p className="text-sm text-neutral-700">
            По этому сектору нет активной заявки от вашей команды. Начните действие с карты.
          </p>
          <Button variant="primary" onClick={() => navigate('/map')} className="mt-3">
            К карте
          </Button>
        </Card>
      )}

      {submission && (
        <SubmissionPanel
          sector={sector}
          submission={submission}
          onDropped={() => navigate('/map')}
        />
      )}
    </div>
  );
}

function SubmissionPanel({
  sector,
  submission,
  onDropped,
}: {
  sector: Sector;
  submission: TaskSubmissionWithDetails;
  onDropped: () => void;
}) {
  const [dropOpen, setDropOpen] = useState(false);

  const sectorLabel = sector.is_home_base
    ? 'K'
    : sector.number != null
      ? formatSectorLabel(sector.difficulty.slug, sector.number)
      : '—';

  const dropInfluence = Math.floor(sector.difficulty.influence_reward / 2);
  const dropExperience = Math.floor(sector.difficulty.experience_reward / 2);

  return (
    <Card>
      <div className="flex items-center gap-2 text-xs text-neutral-700 mb-3">
        <Clock className="w-4 h-4 text-brand-400" />
        <span>
          Действие:{' '}
          <b className="text-neutral-1000">
            {ACTION_LABELS[submission.action_type] ?? submission.action_type}
          </b>{' '}
          · статус <span className="text-neutral-1000">{submission.status}</span>
        </span>
      </div>

      {submission.task ? (
        <>
          <h2 className="font-display text-heading-sm text-neutral-1000 mb-2">
            {submission.task.title}
          </h2>
          <p className="text-sm text-neutral-900 whitespace-pre-wrap">
            {submission.task.question}
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-700">
          Задание не назначено. Обратитесь к администратору.
        </p>
      )}

      {submission.status === 'pending' && (
        <div className="mt-4 bg-info-bg border border-info/40 text-info-text text-sm px-3 py-2 rounded-sm">
          Решите задание вместе с командой и покажите ответ администратору для проверки.
        </div>
      )}

      {submission.status === 'pending' && (
        <div className="mt-4 pt-4 border-t border-neutral-300 flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-700 leading-relaxed">
            Не получается выполнить? Сбросьте сектор — заявка закроется,
            команда получит штраф −{dropInfluence} влияния и −{dropExperience} опыта.
          </p>
          <Button
            variant="danger"
            onClick={() => setDropOpen(true)}
            className="flex-shrink-0 text-sm"
          >
            <span className="inline-flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" />
              Сбросить сектор
            </span>
          </Button>
        </div>
      )}

      {submission.status === 'approved' && (
        <div className="mt-4 bg-success-bg border border-success/40 text-success-text text-sm px-3 py-2 rounded-sm">
          Заявка одобрена. Эффект применён.
        </div>
      )}

      {submission.status === 'rejected' && (
        <div className="mt-4 bg-danger-bg border border-danger/40 text-danger-text text-sm px-3 py-2 rounded-sm">
          Заявка отклонена{submission.comment ? `: ${submission.comment}` : '.'}
        </div>
      )}

      {dropOpen && (
        <DropSectorConfirmModal
          submissionId={submission.id}
          sectorLabel={sectorLabel}
          influencePenalty={dropInfluence}
          experiencePenalty={dropExperience}
          onCancel={() => setDropOpen(false)}
          onDropped={() => {
            setDropOpen(false);
            onDropped();
          }}
        />
      )}
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/map"
      className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-1000"
    >
      <ArrowLeft className="w-4 h-4" />
      К карте
    </Link>
  );
}
