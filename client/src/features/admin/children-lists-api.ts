import { api } from '../../shared/api/client';

export type ChildrenList = {
  id: string;
  name: string;
  created_at: string;
  entry_count: number;
};

export type RosterEntry = {
  id: string;
  list_id: string;
  full_name: string;
  code: string;
  user_id: string | null;
  created_at: string;
};

export function getLists(): Promise<ChildrenList[]> {
  return api.get<ChildrenList[]>('/children-lists');
}

export function createList(name: string): Promise<ChildrenList> {
  return api.post<ChildrenList>('/children-lists', { name });
}

export function deleteList(id: string): Promise<void> {
  return api.delete<void>(`/children-lists/${id}`);
}

export function getEntries(listId: string): Promise<RosterEntry[]> {
  return api.get<RosterEntry[]>(`/children-lists/${listId}/entries`);
}

export function addEntry(
  listId: string,
  fullName: string,
  code?: string,
): Promise<RosterEntry> {
  return api.post<RosterEntry>(`/children-lists/${listId}/entries`, {
    full_name: fullName,
    code: code || undefined,
  });
}

export function deleteEntry(listId: string, entryId: string): Promise<void> {
  return api.delete<void>(`/children-lists/${listId}/entries/${entryId}`);
}
