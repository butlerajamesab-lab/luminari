import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Preview-open auth hook.
 *
 * Lighthouse Render is currently a preview surface. The production OAuth/auth
 * backend is intentionally not enabled yet, and /api/oauth/* is outside the
 * current backend-lock gate. This hook must therefore avoid creating an
 * authorization gate or calling auth.me/auth.logout until the auth gate is
 * deliberately implemented and verified.
 */
export function useAuth(_options?: UseAuthOptions) {
  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("manus-runtime-user-info");
    } catch {
      // Ignore storage errors in preview mode.
    }
  }, []);

  const state = useMemo(() => {
    try {
      localStorage.setItem("manus-runtime-user-info", "null");
    } catch {
      // Ignore storage errors in preview mode.
    }

    return {
      user: null,
      loading: false,
      error: null,
      isAuthenticated: false,
    };
  }, []);

  return {
    ...state,
    refresh: async () => null,
    logout,
  };
}
