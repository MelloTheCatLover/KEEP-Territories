import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle, Download, KeyRound, Loader2, Plus, RefreshCw, RotateCcw, Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  getLists, createList, deleteList,
  getMembers, bulkAdd, removeMember, issueAccount, resetPassword,
  type ChildrenList, type ListMember, type AddChildResult,
} from './children-lists-api';

type Issued = { login: string; password: string; full_name: string; reset?: boolean };

export function AdminChildrenListsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [lists, setLists] = useState<ChildrenList[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<ListMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [addingBulk, setAddingBulk] = useState(false);
  const [addResults, setAddResults] = useState<AddChildResult[] | null>(null);

  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setLists(await getLists());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Не удалось загрузить списки');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  const loadMembers = useCallback(async (listId: string) => {
    setMembersLoading(true);
    setActionError(null);
    try {
      setMembers(await getMembers(listId));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось загрузить детей');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  function selectList(id: string) {
    setSelectedId(id);
    setMembers(null);
    setAddResults(null);
    void loadMembers(id);
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    setCreating(true);
    setActionError(null);
    try {
      await createList(name);
      setNewListName('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка создания списка');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteList(id: string) {
    if (!confirm('Удалить список? Дети останутся в общей базе, только убраны из этого списка.')) return;
    setActionError(null);
    try {
      await deleteList(id);
      if (selectedId === id) {
        setSelectedId(null);
        setMembers(null);
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    }
  }

  async function handleBulkAdd(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !bulkText.trim()) return;
    setAddingBulk(true);
    setActionError(null);
    try {
      const results = await bulkAdd(selectedId, bulkText);
      setAddResults(results);
      setBulkText('');
      await Promise.all([loadMembers(selectedId), refresh()]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка добавления');
    } finally {
      setAddingBulk(false);
    }
  }

  async function handleRemoveMember(childId: string) {
    if (!selectedId) return;
    setActionError(null);
    try {
      await removeMember(selectedId, childId);
      await Promise.all([loadMembers(selectedId), refresh()]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    }
  }

  async function handleIssue(member: ListMember) {
    if (!selectedId) return;
    setIssuingId(member.child_id);
    setActionError(null);
    try {
      const result = await issueAccount(selectedId, member.child_id);
      setIssued({ login: result.login, password: result.password, full_name: member.full_name });
      await loadMembers(selectedId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка создания аккаунта');
    } finally {
      setIssuingId(null);
    }
  }

  async function handleResetPassword(member: ListMember) {
    if (!selectedId) return;
    const custom = prompt(
      `Новый пароль для «${member.full_name}» (оставьте пустым — сгенерируется автоматически):`,
      '',
    );
    if (custom === null) return;
    const password = custom.trim();
    setResettingId(member.child_id);
    setActionError(null);
    try {
      const result = await resetPassword(member.child_id, password || undefined);
      setIssued({ login: result.login, password: result.password, full_name: member.full_name, reset: true });
      await loadMembers(selectedId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка смены пароля');
    } finally {
      setResettingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const selected = lists?.find((l) => l.id === selectedId) ?? null;
  const matchedCount = addResults?.filter((r) => r.matched).length ?? 0;
  const newCount = addResults ? addResults.length - matchedCount : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Списки детей</h1>
          <p className="text-sm text-neutral-700">
            Загрузи ФИО списком. Уже знакомые дети переиспользуются (с их аккаунтом).{' '}
            <Link to="/admin/children" className="text-brand-400 hover:text-brand-300">Все дети →</Link>
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4" />Обновить</span>
        </Button>
      </div>

      {loadError && <ErrorBanner message={loadError} />}
      {actionError && <ErrorBanner message={actionError} />}

      <Card>
        <form onSubmit={handleCreateList} className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="new-list">Новый список</Label>
            <input
              id="new-list"
              className="w-full bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Например: Отряд 1"
              disabled={creating}
            />
          </div>
          <Button type="submit" variant="primary" isLoading={creating} disabled={!newListName.trim()}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Создать</span>
          </Button>
        </form>
      </Card>

      {lists === null ? (
        <Loading />
      ) : lists.length === 0 ? (
        <p className="text-sm text-neutral-700">Списков пока нет.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {lists.map((list) => (
            <Card
              key={list.id}
              className={`cursor-pointer transition-colors ${
                selectedId === list.id ? 'border-brand-500' : 'hover:border-brand-500'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="text-left flex-1" onClick={() => selectList(list.id)}>
                  <div className="font-display text-heading-sm text-neutral-1000">{list.name}</div>
                  <div className="text-sm text-neutral-700">{list.entry_count} детей</div>
                </button>
                <button
                  type="button"
                  className="text-error hover:opacity-80 p-1"
                  onClick={() => void handleDeleteList(list.id)}
                  title="Удалить список"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display text-heading-sm text-neutral-1000">Список «{selected.name}»</h2>
            {members && members.length > 0 && (
              <Button variant="secondary" onClick={() => exportCsv(selected.name, members)}>
                <span className="flex items-center gap-2"><Download className="w-4 h-4" />CSV</span>
              </Button>
            )}
          </div>

          <form onSubmit={handleBulkAdd} className="mb-4">
            <Label htmlFor="bulk">Добавить детей (по одному ФИО в строке)</Label>
            <textarea
              id="bulk"
              className="w-full h-28 bg-neutral-200 border border-neutral-400 rounded-sm px-3 py-2 text-sm text-neutral-1000 font-mono"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Иванов Иван\nПетрова Мария'}
              disabled={addingBulk}
            />
            <div className="mt-2">
              <Button type="submit" variant="primary" isLoading={addingBulk} disabled={!bulkText.trim()}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Добавить списком</span>
              </Button>
            </div>
          </form>

          {addResults && (
            <div className="mb-4 text-sm bg-neutral-200 border border-neutral-400 rounded-sm p-3">
              Добавлено: <span className="text-neutral-1000">{newCount} новых</span>,{' '}
              <span className="text-neutral-1000">{matchedCount} уже были</span> (переиспользованы).
              {matchedCount > 0 && (
                <ul className="mt-2 space-y-0.5 text-neutral-700">
                  {addResults.filter((r) => r.matched).map((r) => (
                    <li key={r.child_id}>
                      <span className="font-mono">{r.code}</span> {r.full_name}
                      {r.login && <> · аккаунт <span className="font-mono">{r.login}</span></>}
                      {r.seasons.length > 0 && <> · смены: {r.seasons.join(', ')}</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {membersLoading ? (
            <Loading />
          ) : members && members.length > 0 ? (
            <ul className="divide-y divide-neutral-300">
              {members.map((m) => (
                <li key={m.child_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm text-neutral-1000">{m.full_name}</span>
                    <span className="text-xs font-mono text-neutral-700 ml-2">{m.code}</span>
                    {m.login && (
                      <div className="text-xs text-neutral-700 mt-0.5 flex flex-wrap gap-x-3 font-mono">
                        <span>логин: <span className="text-neutral-1000">{m.login}</span></span>
                        {m.issued_password && (
                          <span>пароль: <span className="text-neutral-1000">{m.issued_password}</span></span>
                        )}
                      </div>
                    )}
                    {m.seasons.length > 0 && (
                      <div className="text-xs text-neutral-700 mt-0.5">смены: {m.seasons.join(', ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {!m.user_id ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
                        onClick={() => void handleIssue(m)}
                        disabled={issuingId === m.child_id}
                        title="Создать аккаунт"
                      >
                        {issuingId === m.child_id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <KeyRound className="w-4 h-4" />}
                        Создать аккаунт
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
                        onClick={() => void handleResetPassword(m)}
                        disabled={resettingId === m.child_id}
                        title="Сменить пароль"
                      >
                        {resettingId === m.child_id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <RotateCcw className="w-4 h-4" />}
                        Сменить пароль
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-error hover:opacity-80 p-1"
                      onClick={() => void handleRemoveMember(m.child_id)}
                      title="Убрать из списка"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-700">В списке пока нет детей.</p>
          )}
        </Card>
      )}

      {issued && <CredentialsModal issued={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-3 text-neutral-700">
      <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      <span>Загрузка...</span>
    </div>
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportCsv(listName: string, members: ListMember[]): void {
  const header = ['ФИО', 'Код', 'Логин', 'Пароль', 'Смены'];
  const rows = members.map((m) =>
    [m.full_name, m.code, m.login ?? '', m.issued_password ?? '', m.seasons.join(', ')]
      .map(csvCell)
      .join(';'),
  );
  const csv = '﻿' + [header.map(csvCell).join(';'), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${listName.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CredentialsModal({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--state-overlay-backdrop)' }}
      onClick={onClose}
    >
      <div
        className="bg-neutral-100 border border-neutral-400 rounded-sm p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-heading-sm text-neutral-1000 mb-1">
          {issued.reset ? 'Пароль изменён' : 'Аккаунт создан'}
        </h2>
        <p className="text-sm text-neutral-700 mb-4">{issued.full_name}. Передайте данные ребёнку.</p>
        <dl className="text-sm space-y-2 mb-5">
          <div className="flex justify-between gap-3 items-center">
            <dt className="text-neutral-700">Логин</dt>
            <dd className="font-mono px-2 py-0.5 rounded-sm bg-neutral-200 text-neutral-1000">{issued.login}</dd>
          </div>
          <div className="flex justify-between gap-3 items-center">
            <dt className="text-neutral-700">Пароль</dt>
            <dd className="font-mono px-2 py-0.5 rounded-sm bg-neutral-200 text-neutral-1000">{issued.password}</dd>
          </div>
        </dl>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>Готово</Button>
        </div>
      </div>
    </div>
  );
}
