import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const PREVIEW_AUTH_STORAGE_KEY = "lighthouse-preview-auth-open";

const previewUser = {
  id: "preview_user",
  email: "preview@lighthouse.local",
  name: "Lighthouse Preview User",
  role: "viewer",
  authenticated: true,
  source: "temporary_lighthouse_preview_auth_open",
  previewAuthOpen: true,
};

/**
 * Temporary Render preview gate opener.
 *
 * This returns a deterministic preview identity so protected UI shells can be
 * inspected while production OAuth is offline. Remove this when production auth
 * is restored.
 */
export function useAuth(_options?: UseAuthOptions) {
  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("manus-runtime-user-info");
      localStorage.removeItem(PREVIEW_AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors in preview mode.
    }
  }, []);

  const state = useMemo(() => {
    try {
      localStorage.setItem(PREVIEW_AUTH_STORAGE_KEY, "true");
      localStorage.setItem("manus-runtime-user-info", JSON.stringify(previewUser));
    } catch {
      // Ignore storage errors in preview mode.
    }

    return {
      user: previewUser,
      loading: false,
      error: null,
      isAuthenticated: true,
      isInspectionMode: true,
      isPreviewAuthOpen: true,
    };
  }, []);

  return {
    ...state,
    refresh: async () => previewUser,
    logout,
  };
}
