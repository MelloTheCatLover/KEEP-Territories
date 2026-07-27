import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSettings } from '../admin/settings-api';

/**
 * May the current viewer see trophy standings at all — live ones on the map,
 * archived ones on a season page, the finals ceremony? Admins always may;
 * everyone else only while the admin keeps the `trophies_visible` flag on.
 * The server enforces the same rule; this just keeps the UI from showing
 * doors that lead to a 403.
 *
 * `loading` is true until the flag is known, so callers can hold off on
 * fetching trophy data instead of flashing it.
 */
export function useTrophiesVisible(): { canSee: boolean; loading: boolean } {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(!isAdmin);

  useEffect(() => {
    if (isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSettings()
      .then((list) => {
        if (cancelled) return;
        setVisible(list.find((s) => s.key === 'trophies_visible')?.value === '1');
      })
      .catch(() => {
        // Unknown flag — stay on the safe side and keep trophies hidden.
        if (!cancelled) setVisible(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return { canSee: isAdmin || visible, loading };
}
