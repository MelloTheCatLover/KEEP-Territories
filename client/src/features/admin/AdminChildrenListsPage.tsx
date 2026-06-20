import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBanner, Input, Label } from '../../shared/ui';
import { ApiError } from '../../shared/api/client';
import {
  getLists,
  createList,
  deleteList,
  getEntries,
  addEntry,
  deleteEntry,
  type ChildrenList,
  type RosterEntry,
} from './children-lists-api';

export function AdminChildrenListsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [lists, setLists] = useState<ChildrenList[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<RosterEntry[] | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [addingChild, setAddingChild] = useState(false);

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

  const loadEntries = useCallback(async (listId: string) => {
    setEntriesLoading(true);
    setActionError(null);
    try {
      setEntries(await getEntries(listId));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Не удалось загрузить записи');
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  function selectList(id: string) {
    setSelectedId(id);
    setEntries(null);
    void loadEntries(id);
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
    if (!confirm('Удалить список и всех детей в нём? Привязанные аккаунты станут наблюдателями.')) return;
    setActionError(null);
    try {
      await deleteList(id);
      if (selectedId === id) {
        setSelectedId(null);
        setEntries(null);
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка удаления');
    }
  }

  async function handleAddChild(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const name = newChildName.trim();
    if (!name) return;
    setAddingChild(true);
    setActionError(null);
    try {
      await addEntry(selectedId, name);
      setNewChildName('');
      await Promise.all([loadEntries(selectedId), refresh()]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Ошибка добавления');
    } finally {
      setAddingChild(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!selectedId) return;
    setActionError(null);
    try {
      await deleteEntry(selectedId, entryId);
      await Promise.all([loadEntries(selectedId), refresh()]);
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
              <h1 className="font-display text-heading-sm text-neutral-1000 mb-1">Доступ запрещён</h1>
              <p className="text-sm text-neutral-700">Эта страница доступна только администраторам.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const selected = lists?.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-md text-neutral-1000 mb-1">Списки детей</h1>
          <p className="text-sm text-neutral-700">
            Дети регистрируются по коду из списка. Сезон даёт доступ к карте детям из привязанных списков.
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
            <Input
              id="new-list"
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
        <div className="flex items-center gap-3 text-neutral-700">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span>Загрузка...</span>
        </div>
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
          <h2 className="font-display text-heading-sm text-neutral-1000 mb-3">
            Дети в списке «{selected.name}»
          </h2>

          <form onSubmit={handleAddChild} className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <Label htmlFor="new-child">Имя ребёнка</Label>
              <Input
                id="new-child"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="Фамилия Имя"
                disabled={addingChild}
              />
            </div>
            <Button type="submit" variant="primary" isLoading={addingChild} disabled={!newChildName.trim()}>
              <span className="flex items-center gap-2"><UserPlus className="w-4 h-4" />Добавить</span>
            </Button>
          </form>

          {entriesLoading ? (
            <div className="flex items-center gap-3 text-neutral-700">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              <span>Загрузка...</span>
            </div>
          ) : entries && entries.length > 0 ? (
            <ul className="divide-y divide-neutral-300">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-neutral-1000">{entry.full_name}</span>
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm px-2 py-0.5 rounded-sm bg-neutral-200 text-neutral-1000">
                      {entry.code}
                    </code>
                    <span
                      className={`text-xs ${entry.user_id ? 'text-success-text' : 'text-neutral-700'}`}
                    >
                      {entry.user_id ? 'привязан' : 'свободен'}
                    </span>
                    <button
                      type="button"
                      className="text-error hover:opacity-80 p-1"
                      onClick={() => void handleDeleteEntry(entry.id)}
                      title="Удалить запись"
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
    </div>
  );
}
