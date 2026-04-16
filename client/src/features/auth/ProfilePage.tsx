import { useAuth } from './AuthContext';
import { Card, Button } from '../../shared/ui';

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const rows = [
    { label: 'Username', value: user.username },
    { label: 'Email', value: user.email },
    { label: 'Role', value: user.role },
    { label: 'Team role', value: user.team_role ?? '—' },
    { label: 'Team ID', value: user.team_id ?? 'No team' },
    { label: 'Joined', value: new Date(user.created_at).toLocaleDateString() },
  ];

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-5">Profile</h1>

        <div className="space-y-3 mb-5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="label text-neutral-700">{row.label}</span>
              <span className="text-base text-neutral-900 font-medium">{row.value}</span>
            </div>
          ))}
        </div>

        <Button variant="secondary" className="w-full" onClick={logout}>
          Log out
        </Button>
      </Card>
    </main>
  );
}
