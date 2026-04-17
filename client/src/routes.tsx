import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ProfilePage } from './features/auth/ProfilePage';
import { MapPage } from './features/map/MapPage';
import { TeamPage } from './features/team/TeamPage';
import { AdminSubmissionsPage } from './features/admin/AdminSubmissionsPage';
import { AdminMapPage } from './features/admin/AdminMapPage';
import { AdminHubPage } from './features/admin/AdminHubPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { GuestRoute } from './features/auth/GuestRoute';
import { AppLayout } from './shared/ui/AppLayout';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/map" replace /> },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <LoginPage />
      </GuestRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestRoute>
        <RegisterPage />
      </GuestRoute>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/map', element: <MapPage /> },
      { path: '/team', element: <TeamPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/admin', element: <AdminHubPage /> },
      { path: '/admin/map', element: <AdminMapPage /> },
      { path: '/admin/submissions', element: <AdminSubmissionsPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

function NotFound() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-2">404</h1>
        <p className="text-neutral-700">Страница не найдена.</p>
      </div>
    </main>
  );
}
