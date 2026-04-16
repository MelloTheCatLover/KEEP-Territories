import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ProfilePage } from './features/auth/ProfilePage';
import { MapPage } from './features/map/MapPage';
import { TeamPage } from './features/team/TeamPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { GuestRoute } from './features/auth/GuestRoute';

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
    path: '/map',
    element: (
      <ProtectedRoute>
        <MapPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/team',
    element: (
      <ProtectedRoute>
        <TeamPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFound /> },
]);

function NotFound() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-heading-md text-neutral-1000 mb-2">404</h1>
        <p className="text-neutral-700">Page not found.</p>
      </div>
    </main>
  );
}
