import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { AuthSplash } from './features/auth/AuthSplash';

function AppShell() {
  const { status } = useAuth();
  if (status === 'loading') return <AuthSplash />;
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
