import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const INSPECTION_STORAGE_KEY = "lighthouse-inspection-mode";

function getInspectionMode(): boolean {
  if (import.meta.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true") return true;

  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const queryFlag = params.get("inspection") ?? params.get("inspect");

    if (queryFlag === "1" || queryFlag === "true") {
      localStorage.setItem(INSPECTION_STORAGE_KEY, "true");
      return true;
    }

    return localStorage.getItem(INSPECTION_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const inspectionUser = {
  id: "inspection_user",
  email: "inspection@lighthouse.local",
  name: "Inspection User",
  role: "admin",
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
  const inspectionMode = getInspectionMode();

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("manus-runtime-user-info");
      localStorage.removeItem(INSPECTION_STORAGE_KEY);
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
  }, [inspectionMode]);

  return {
    ...state,
    refresh: async () => (inspectionMode ? inspectionUser : null),
    logout,
  };
}
