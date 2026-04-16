import { Outlet } from 'react-router-dom';
import { Header } from '../../features/navigation/Header';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
