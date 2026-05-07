import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const inspectionMode = import.meta.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true";

const inspectionUser = {
  id: "inspection_user",
  email: "butlerajames.ab@gmail.com",
  name: "Inspection User",
  role: "inspector",
  authenticated: true,
  source: "temporary_lighthouse_inspection_mode",
  inspectionMode: true,
};

/**
 * Preview-open auth hook.
 *
 * Lighthouse Render is currently a preview/inspection surface. Production
 * OAuth/auth is intentionally not activated here. When inspection mode is
 * enabled, the UI receives a deterministic inspector identity so admin/control
 * pages can be viewed without enabling real auth, mutating Supabase, or
 * exposing service-role keys.
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
      localStorage.setItem(
        "manus-runtime-user-info",
        inspectionMode ? JSON.stringify(inspectionUser) : "null"
      );
    } catch {
      // Ignore storage errors in preview mode.
    }

    if (inspectionMode) {
      return {
        user: inspectionUser,
        loading: false,
        error: null,
        isAuthenticated: true,
        isInspectionMode: true,
      };
    }

    return {
      user: null,
      loading: false,
      error: null,
      isAuthenticated: false,
      isInspectionMode: false,
    };
  }, []);

  return {
    ...state,
    refresh: async () => (inspectionMode ? inspectionUser : null),
    logout,
  };
}
