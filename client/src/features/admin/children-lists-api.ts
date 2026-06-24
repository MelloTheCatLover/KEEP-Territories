import { api } from '../../shared/api/client';

export type ChildrenList = {
  id: string;
  name: string;
  created_at: string;
  entry_count: number;
};

export type ListMember = {
  child_id: string;
  code: string;
  full_name: string;
  user_id: string | null;
  login: string | null;
  issued_password: string | null;
  seasons: string[];
};

export type AddChildResult = {
  child_id: string;
  code: string;
  full_name: string;
  matched: boolean;
  login: string | null;
  seasons: string[];
};

export type IssuedAccount = {
  login: string;
  password: string;
  child_id: string;
};

export type IssuedAccountFull = IssuedAccount & { full_name: string };

export type ChildDashboardRow = {
  id: string;
  code: string;
  full_name: string;
  login: string | null;
  has_account: boolean;
  lists: string[];
  seasons: string[];
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

export function getMembers(listId: string): Promise<ListMember[]> {
  return api.get<ListMember[]>(`/children-lists/${listId}/members`);
}

export function addChild(listId: string, fullName: string): Promise<AddChildResult> {
  return api.post<AddChildResult>(`/children-lists/${listId}/members`, { full_name: fullName });
}

export function bulkAdd(listId: string, text: string): Promise<AddChildResult[]> {
  return api.post<AddChildResult[]>(`/children-lists/${listId}/members/bulk`, { text });
}

export function removeMember(listId: string, childId: string): Promise<void> {
  return api.delete<void>(`/children-lists/${listId}/members/${childId}`);
}

export function issueAccount(listId: string, childId: string): Promise<IssuedAccount> {
  return api.post<IssuedAccount>(`/children-lists/${listId}/members/${childId}/account`);
}

export function resetPassword(childId: string, password?: string): Promise<IssuedAccount> {
  return api.post<IssuedAccount>(`/children-lists/children/${childId}/password`, { password });
}

export function getDashboard(): Promise<ChildDashboardRow[]> {
  return api.get<ChildDashboardRow[]>('/children-lists/dashboard');
}

export function issueAllAccounts(): Promise<IssuedAccountFull[]> {
  return api.post<IssuedAccountFull[]>('/children-lists/accounts/issue-all');
}

export function deleteChild(childId: string): Promise<void> {
  return api.delete<void>(`/children-lists/children/${childId}`);
}
