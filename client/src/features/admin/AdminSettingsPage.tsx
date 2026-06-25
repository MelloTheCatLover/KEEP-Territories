import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  getSettings,
  updateSetting,
  type GameSetting,
  type GameSettingKey,
} from './settings-api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; settings: GameSetting[] };

type ConfirmState =
  | { key: GameSettingKey; oldValue: string; newValue: string; warning: string }
  | null;

const SETTING_META: Record<
  GameSettingKey,
  { label: string; hint: string; warning: string; min: number; max: number }
> = {
  base_exp_threshold: {
    label: 'Базовый порог опыта',
    hint: 'Сколько опыта нужно для перехода с уровня 1 на 2.',
    warning: 'Пересчитает уровни всех команд.',
    min: 1,
    max: 100000,
  },
  exp_step: {
    label: 'Шаг опыта',
    hint: 'На сколько растёт порог следующего уровня.',
    warning: 'Пересчитает уровни всех команд.',
    min: 0,
    max: 100000,
  },
  max_fortification_level: {
    label: 'Макс. уровень укрепления',
    hint: 'Верхняя граница для укрепления сектора.',
    warning: 'Существующие более высокие укрепления НЕ снизятся автоматически.',
    min: 0,
    max: 10,
  },
};

export function AdminSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [saving, setSaving] = useState<GameSettingKey | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const settings = await getSettings();
      setState({ status: 'ready', settings });
      setDrafts(Object.fromEntries(settings.map((s) => [s.key, s.value])));
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Не удалось загрузить настройки',
      });
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  function startSave(setting: GameSetting) {
    const draft = drafts[setting.key]?.trim() ?? '';
    if (!draft) {
      setActionError(`Значение для «${setting.key}» не может быть пустым`);
      return;
    }
    if (draft === setting.value) return;
    const meta = SETTING_META[setting.key as GameSettingKey];
    const num = Number(draft);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      setActionError(`«${setting.key}»: значение должно быть целым числом`);
      return;
    }
    if (meta && (num < meta.min || num > meta.max)) {
      setActionError(`«${setting.key}»: вне диапазона ${meta.min}..${meta.max}`);
      return;
    }
    setActionError(null);
    setConfirm({
      key: setting.key as GameSettingKey,
      oldValue: setting.value,
      newValue: draft,
      warning: meta?.warning ?? 'Изменение применится сразу.',
    });
  }

  async function applySave() {
    if (!confirm) return;
    setSaving(confirm.key);
    setActionError(null);
    try {
      const next = await updateSetting(confirm.key, confirm.newValue);
      setState({ status: 'ready', settings: next });
      setDrafts(Object.fromEntries(next.map((s) => [s.key, s.value])));
      setFlash(`«${confirm.key}» обновлено: ${confirm.oldValue} → ${confirm.newValue}`);
      setConfirm(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(null);
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
    <div className="max-w-3xl mx-auto px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">
            Админ — настройки
          </h1>
          <p className="text-sm text-neutral-700">
            Глобальные параметры игры. Изменения применяются мгновенно.
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
          <span>Загрузка...</span>
        </div>
      )}
      {state.status === 'error' && <ErrorBanner message={state.message} />}

      {state.status === 'ready' && (
        <div className="space-y-3">
          {state.settings.map((setting) => {
            const meta = SETTING_META[setting.key as GameSettingKey];
            const draft = drafts[setting.key] ?? setting.value;
            const dirty = draft.trim() !== setting.value;
            return (
              <Card key={setting.key}>
                <div className="space-y-3">
                  <div>
                    <div className="font-mono text-xs text-neutral-700 mb-1">
                      {setting.key}
                    </div>
                    <div className="font-display text-heading-sm text-neutral-1000">
                      {meta?.label ?? setting.key}
                    </div>
                    {meta?.hint && (
                      <p className="text-sm text-neutral-700 mt-1">{meta.hint}</p>
                    )}
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor={`setting-${setting.key}`}>Значение</Label>
                      <Input
                        id={`setting-${setting.key}`}
                        type="number"
                        value={draft}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [setting.key]: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      {dirty && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setDrafts({ ...drafts, [setting.key]: setting.value })
                          }
                          disabled={saving === setting.key}
                        >
                          Сбросить
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        onClick={() => startSave(setting)}
                        disabled={!dirty || saving === setting.key}
                        isLoading={saving === setting.key}
                      >
                        Сохранить
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-neutral-700">
                    Текущее: <span className="font-mono">{setting.value}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          confirm={confirm}
          onClose={() => setConfirm(null)}
          onApply={() => void applySave()}
          busy={saving !== null}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  confirm,
  onClose,
  onApply,
  busy,
}: {
  confirm: NonNullable<ConfirmState>;
  onClose: () => void;
  onApply: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">
          Подтвердите изменение
        </h2>

        <div className="bg-warning-bg border border-warning/40 text-warning-text text-sm rounded-sm px-3 py-2 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{confirm.warning}</span>
        </div>

        <dl className="text-sm space-y-1 mb-5">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-700">Параметр</dt>
            <dd className="font-mono text-neutral-1000">{confirm.key}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-700">Было</dt>
            <dd className="font-mono text-neutral-900">{confirm.oldValue}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-700">Станет</dt>
            <dd className="font-mono text-neutral-1000">{confirm.newValue}</dd>
          </div>
        </dl>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="primary" onClick={onApply} isLoading={busy}>
            Применить
          </Button>
        </div>
      </div>
    </div>
  );
}
