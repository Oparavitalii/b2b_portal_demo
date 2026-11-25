import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/http';

// "Wyloguj się" (R-11): POST /api/auth/logout, then drop the session locally
// whatever the answer, clear cached data and go to /logowanie.
export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const logout = useCallback(async () => {
    setPending(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // The session is dropped locally either way.
    } finally {
      clear();
      queryClient.clear();
      setPending(false);
      navigate('/logowanie', { replace: true });
    }
  }, [clear, queryClient, navigate]);

  return { logout, pending };
}
