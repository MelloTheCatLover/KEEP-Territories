import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { MapPage } from './features/map/MapPage';
import { TeamPage } from './features/team/TeamPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/map" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/map', element: <MapPage /> },
  { path: '/team', element: <TeamPage /> },
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
