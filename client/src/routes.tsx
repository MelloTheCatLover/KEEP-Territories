import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { ProfilePage } from './features/auth/ProfilePage';
import { MapPage } from './features/map/MapPage';
import { SectorPage } from './features/map/SectorPage';
import { TeamPage } from './features/team/TeamPage';
import { AdminSubmissionsPage } from './features/admin/AdminSubmissionsPage';
import { AdminMapPage } from './features/admin/AdminMapPage';
import { AdminTasksPage } from './features/admin/AdminTasksPage';
import { AdminSettingsPage } from './features/admin/AdminSettingsPage';
import { AdminTeamsPage } from './features/admin/AdminTeamsPage';
import { AdminHubPage } from './features/admin/AdminHubPage';
import { AdminTrophiesPage } from './features/admin/AdminTrophiesPage';
import { AdminSectorTasksPage } from './features/admin/AdminSectorTasksPage';
import { AdminSeasonsPage } from './features/admin/AdminSeasonsPage';
import { AdminChildrenListsPage } from './features/admin/AdminChildrenListsPage';
import { AdminChildrenDashboardPage } from './features/admin/AdminChildrenDashboardPage';
import { AdminDistributionPage } from './features/admin/AdminDistributionPage';
import { AdminAuditPage } from './features/admin/AdminAuditPage';
import { AdminCongressPage } from './features/admin/AdminCongressPage';
import { TeamsOverviewPage } from './features/leaderboard/TeamsOverviewPage';
import { SeasonsPage } from './features/seasons/SeasonsPage';
import { SeasonViewPage } from './features/seasons/SeasonViewPage';
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
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/map', element: <MapPage /> },
      { path: '/teams', element: <TeamsOverviewPage /> },
      { path: '/seasons', element: <SeasonsPage /> },
      { path: '/seasons/:id', element: <SeasonViewPage /> },
      { path: '/sectors/:id', element: <SectorPage /> },
      { path: '/team', element: <TeamPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/admin', element: <AdminHubPage /> },
      { path: '/admin/map', element: <AdminMapPage /> },
      { path: '/admin/tasks', element: <AdminTasksPage /> },
      { path: '/admin/settings', element: <AdminSettingsPage /> },
      { path: '/admin/teams', element: <AdminTeamsPage /> },
      { path: '/admin/submissions', element: <AdminSubmissionsPage /> },
      { path: '/admin/trophies', element: <AdminTrophiesPage /> },
      { path: '/admin/sector-tasks', element: <AdminSectorTasksPage /> },
      { path: '/admin/seasons', element: <AdminSeasonsPage /> },
      { path: '/admin/children-lists', element: <AdminChildrenListsPage /> },
      { path: '/admin/children', element: <AdminChildrenDashboardPage /> },
      { path: '/admin/distribution', element: <AdminDistributionPage /> },
      { path: '/admin/audit', element: <AdminAuditPage /> },
      { path: '/admin/congress', element: <AdminCongressPage /> },
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
