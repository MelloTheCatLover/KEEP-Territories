import { useAuth } from './AuthContext';
import { Card, Button } from '../../shared/ui';

const roleLabels: Record<string, string> = {
  student: 'Участник',
  admin: 'Администратор',
};

const teamRoleLabels: Record<string, string> = {
  captain: 'Капитан',
  member: 'Участник',
};

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const rows = [
    { label: 'Никнейм', value: user.username },
    { label: 'Email', value: user.email },
    { label: 'Роль', value: roleLabels[user.role] ?? user.role },
    { label: 'Роль в команде', value: user.team_role ? (teamRoleLabels[user.team_role] ?? user.team_role) : '—' },
    { label: 'ID команды', value: user.team_id ?? 'Нет команды' },
    { label: 'Дата регистрации', value: new Date(user.created_at).toLocaleDateString() },
  ];

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-5">Профиль</h1>

        <div className="space-y-3 mb-5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="label text-neutral-700">{row.label}</span>
              <span className="text-base text-neutral-900 font-medium">{row.value}</span>
            </div>
          ))}
        </div>

        <Button variant="secondary" className="w-full" onClick={logout}>
          Выйти
        </Button>
      </Card>
    </div>
  );
}
