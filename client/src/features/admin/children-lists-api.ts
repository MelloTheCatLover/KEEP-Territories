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

export type ParticipantCategory = 'mvp' | 'winner' | 'participant' | 'newbie';

export type RosterImportEntry = {
  full_name: string;
  code: string;
  matched: boolean;
  category: ParticipantCategory;
  sparks: number;
  login: string;
  /** Login printed in the sheet — differs from `login` when the account is older. */
  sheet_login: string;
  password: string;
  account: 'created' | 'password_updated';
};

export type RosterImportResult = {
  /** False for a preview run: the numbers are what would happen. */
  applied: boolean;
  list_name: string;
  created: number;
  matched: number;
  accounts_created: number;
  passwords_updated: number;
  resynced: number;
  entries: RosterImportEntry[];
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

/**
 * Import the counselor's spreadsheet (ФИО / Искры / КТП / КТБ / Логин / Пароль)
 * into the list. With apply=false the server rolls back and returns a preview.
 */
export function importRoster(listId: string, text: string, apply: boolean): Promise<RosterImportResult> {
  return api.post<RosterImportResult>(`/children-lists/${listId}/import`, { text, apply });
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
