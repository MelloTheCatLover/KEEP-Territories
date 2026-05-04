import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Play, XCircle } from 'lucide-react';
import { Button, Card, ErrorBanner } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { getCurrentSubmission, getSectorById } from './api';
import type { Sector } from './types';
import { formatSectorLabel } from './types';
import {
  runSubmissionCode,
  type TaskSubmissionWithDetails,
  type TestRunResult,
} from '../admin/submissions-api';
import { CodeEditor } from './CodeEditor';

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

      {submission && <SubmissionPanel submission={submission} onUpdated={(s) => setState({ status: 'ready', sector, submission: s })} />}
    </div>
  );
}

function SubmissionPanel({
  submission,
  onUpdated,
}: {
  submission: TaskSubmissionWithDetails;
  onUpdated: (next: TaskSubmissionWithDetails) => void;
}) {
  const isCodeTask =
    !!submission.task &&
    submission.task.code_language !== null &&
    submission.task.has_test_cases;

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
          {submission.auto_approved && submission.status === 'approved' && (
            <span className="ml-2 text-success-text">(автопроверка)</span>
          )}
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

      {isCodeTask && submission.status === 'pending' && (
        <div className="mt-4">
          <CodeRunner submission={submission} onUpdated={onUpdated} />
        </div>
      )}

      {!isCodeTask && submission.status === 'pending' && (
        <div className="mt-4 bg-info-bg border border-info/40 text-info-text text-sm px-3 py-2 rounded-sm">
          Решите задание вместе с командой и покажите ответ администратору для проверки.
        </div>
      )}

      {submission.status === 'approved' && (
        <div className="mt-4 bg-success-bg border border-success/40 text-success-text text-sm px-3 py-2 rounded-sm">
          Заявка одобрена{submission.auto_approved ? ' автоматически' : ''}. Эффект применён.
        </div>
      )}

      {submission.status === 'rejected' && (
        <div className="mt-4 bg-danger-bg border border-danger/40 text-danger-text text-sm px-3 py-2 rounded-sm">
          Заявка отклонена{submission.comment ? `: ${submission.comment}` : '.'}
        </div>
      )}
    </Card>
  );
}

function CodeRunner({
  submission,
  onUpdated,
}: {
  submission: TaskSubmissionWithDetails;
  onUpdated: (next: TaskSubmissionWithDetails) => void;
}) {
  const task = submission.task!;
  const language = task.code_language!;

  const [code, setCode] = useState<string>(
    submission.code ?? task.code_template ?? '',
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TestRunResult[] | null>(
    submission.last_run_results ?? null,
  );
  const [allPassed, setAllPassed] = useState<boolean | null>(
    submission.last_run_results
      ? submission.last_run_results.every((r) => r.passed)
      : null,
  );

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await runSubmissionCode(submission.id, code);
      setResults(res.results);
      setAllPassed(res.passed);
      onUpdated(res.submission);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось запустить проверку');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <CodeEditor
        value={code}
        onChange={setCode}
        language={language}
        disabled={running}
      />

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={() => void handleRun()}
          disabled={running || code.trim().length === 0}
          isLoading={running}
        >
          <span className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            Запустить тесты
          </span>
        </Button>
        {allPassed === true && (
          <span className="text-sm text-success-text inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            Все тесты пройдены, заявка одобрена
          </span>
        )}
        {allPassed === false && (
          <span className="text-sm text-warning-text">
            Не все тесты пройдены — попробуйте ещё раз
          </span>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li
              key={r.ord}
              className={`border rounded-sm px-3 py-2 text-xs ${
                r.passed
                  ? 'border-success/40 bg-success-bg/40'
                  : 'border-danger/40 bg-danger-bg/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {r.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-success-text" />
                ) : (
                  <XCircle className="w-4 h-4 text-danger-text" />
                )}
                <span className="font-mono">Тест #{r.ord + 1}</span>
                {r.timed_out && (
                  <span className="text-warning-text font-mono">timeout</span>
                )}
                {r.error && !r.timed_out && (
                  <span className="text-danger-text font-mono">{r.error}</span>
                )}
              </div>
              {!r.passed && (
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-2xs font-mono">
                  <CodeBlock label="Вход" value={r.input} />
                  <CodeBlock label="Ожидалось" value={r.expected} />
                  <CodeBlock label="Получено" value={r.actual} stderr={r.stderr} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CodeBlock({
  label,
  value,
  stderr,
}: {
  label: string;
  value: string;
  stderr?: string;
}) {
  return (
    <div>
      <div className="uppercase tracking-wide text-neutral-700 mb-0.5">{label}</div>
      <pre className="bg-neutral-50 border border-neutral-400 rounded-sm px-2 py-1 whitespace-pre-wrap break-words max-h-32 overflow-auto text-neutral-1000">
        {value || '∅'}
      </pre>
      {stderr && stderr.trim().length > 0 && (
        <pre className="mt-1 bg-danger-bg/30 border border-danger/30 rounded-sm px-2 py-1 whitespace-pre-wrap break-words max-h-32 overflow-auto text-danger-text">
          {stderr}
        </pre>
      )}
    </div>
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
