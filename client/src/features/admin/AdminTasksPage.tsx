import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import { difficultyColors } from '../../design-system/design-tokens';
import {
  createTask,
  deleteTask,
  getDifficulties,
  getTasks,
  updateTask,
  type Difficulty,
  type TaskSummary,
  type TaskUpsertDto,
} from './tasks-api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      tasks: TaskSummary[];
      difficulties: Difficulty[];
    };

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; task: TaskSummary }
  | { kind: 'delete'; task: TaskSummary }
  | null;

export function AdminTasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [modal, setModal] = useState<ModalState>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [tasks, difficulties] = await Promise.all([
        getTasks(),
        getDifficulties(),
      ]);
      setState({ status: 'ready', tasks, difficulties });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Не удалось загрузить задания';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  async function handleUpsert(dto: TaskUpsertDto, id?: string) {
    setActionError(null);
    try {
      if (id) {
        await updateTask(id, dto);
        setFlash('Задание обновлено');
      } else {
        await createTask(dto);
        setFlash('Задание создано');
      }
      setModal(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    }
  }

  async function handleDelete(task: TaskSummary) {
    setActionError(null);
    try {
      await deleteTask(task.id);
      setFlash(`Задание «${task.title}» удалено`);
      setModal(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
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
            Админ — задания
          </h1>
          <p className="text-sm text-neutral-700">
            Пул заданий, привязываемых к секторам при генерации карты.
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button
            variant="primary"
            onClick={() => setModal({ kind: 'create' })}
            disabled={state.status !== 'ready'}
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Новое
            </span>
          </Button>
        </div>
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
          <span>Загрузка...</span>
        </div>
      )}
      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && state.tasks.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-700">
            Заданий пока нет. Создайте первое кнопкой «Новое».
          </p>
        </Card>
      )}

      {state.status === 'ready' && state.tasks.length > 0 && (
        <Card>
          <TasksTable
            tasks={state.tasks}
            onEdit={(task) => setModal({ kind: 'edit', task })}
            onDelete={(task) => setModal({ kind: 'delete', task })}
          />
        </Card>
      )}

      {modal?.kind === 'create' && state.status === 'ready' && (
        <UpsertModal
          title="Новое задание"
          difficulties={state.difficulties}
          onClose={() => setModal(null)}
          onSubmit={(dto) => handleUpsert(dto)}
        />
      )}
      {modal?.kind === 'edit' && state.status === 'ready' && (
        <UpsertModal
          title="Редактировать задание"
          difficulties={state.difficulties}
          initial={modal.task}
          onClose={() => setModal(null)}
          onSubmit={(dto) => handleUpsert(dto, modal.task.id)}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteModal
          task={modal.task}
          onClose={() => setModal(null)}
          onConfirm={() => handleDelete(modal.task)}
        />
      )}
    </div>
  );
}

type TableProps = {
  tasks: TaskSummary[];
  onEdit: (task: TaskSummary) => void;
  onDelete: (task: TaskSummary) => void;
};

function TasksTable({ tasks, onEdit, onDelete }: TableProps) {
  return (
    <div className="overflow-x-auto -m-5">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-neutral-700 border-b border-neutral-300">
          <tr>
            <th className="px-5 py-2 font-medium">Название</th>
            <th className="px-5 py-2 font-medium">Сложность</th>
            <th className="px-5 py-2 font-medium">Вопрос</th>
            <th className="px-5 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const color = difficultyColors[task.difficulty.slug];
            return (
              <tr
                key={task.id}
                className="border-b border-neutral-200 last:border-b-0 hover:bg-neutral-200/40"
              >
                <td className="px-5 py-3 text-neutral-1000 align-top">
                  {task.title}
                </td>
                <td className="px-5 py-3 align-top">
                  <span
                    className="px-2 py-0.5 rounded-sm text-xs font-mono"
                    style={{
                      backgroundColor: `${color}22`,
                      color: 'var(--color-neutral-1000)',
                      border: `1px solid ${color}`,
                    }}
                  >
                    {task.difficulty.name}
                  </span>
                </td>
                <td className="px-5 py-3 text-neutral-800 align-top">
                  <span className="line-clamp-2">{task.question}</span>
                </td>
                <td className="px-5 py-3 align-top text-right whitespace-nowrap">
                  <button
                    onClick={() => onEdit(task)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-900 hover:text-neutral-1000 hover:bg-neutral-300 rounded-sm transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Изменить
                  </button>
                  <button
                    onClick={() => onDelete(task)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-danger-text hover:bg-danger-bg rounded-sm transition-colors ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type UpsertModalProps = {
  title: string;
  difficulties: Difficulty[];
  initial?: TaskSummary;
  onClose: () => void;
  onSubmit: (dto: TaskUpsertDto) => void | Promise<void>;
};

function UpsertModal({
  title,
  difficulties,
  initial,
  onClose,
  onSubmit,
}: UpsertModalProps) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    question: initial?.question ?? '',
    difficulty_id: initial?.difficulty_id ?? difficulties[0]?.id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!form.title.trim()) return 'Укажите название';
    if (!form.question.trim()) return 'Укажите вопрос';
    if (!form.difficulty_id) return 'Выберите сложность';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        question: form.question.trim(),
        difficulty_id: form.difficulty_id,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={busy ? undefined : onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="font-display text-heading-sm text-neutral-1000">{title}</h2>

        {error && <ErrorBanner message={error} />}

        <div>
          <Label htmlFor="task-title">Название</Label>
          <Input
            id="task-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Пример: Интегралы 1"
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="task-question">Вопрос</Label>
          <textarea
            id="task-question"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            rows={4}
            className="w-full bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none"
            placeholder="Текст задания, который увидит команда"
          />
        </div>

        <div>
          <Label htmlFor="task-difficulty">Сложность</Label>
          <select
            id="task-difficulty"
            value={form.difficulty_id}
            onChange={(e) => setForm({ ...form, difficulty_id: e.target.value })}
            className="w-full bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-base text-neutral-900 focus:border-brand-500 focus:outline-none"
          >
            {difficulties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Отмена
          </Button>
          <Button type="submit" variant="primary" isLoading={busy}>
            {initial ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

type DeleteModalProps = {
  task: TaskSummary;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

function DeleteModal({ task, onClose, onConfirm }: DeleteModalProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={busy ? undefined : onClose}>
      <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
        Удалить задание?
      </h2>
      <p className="text-sm text-neutral-800 mb-4">
        «{task.title}» будет удалено. Секторы, использующие это задание,
        потеряют привязку.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="danger" onClick={() => void handleConfirm()} isLoading={busy}>
          Удалить
        </Button>
      </div>
    </ModalBackdrop>
  );
}

function ModalBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
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
        {children}
      </div>
    </div>
  );
}
