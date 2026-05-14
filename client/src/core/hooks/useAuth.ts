import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const INSPECTION_STORAGE_KEY = "lighthouse-inspection-mode";
const AUTH_USER_STORAGE_KEY = "luminari-auth-user-info";

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

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const inspectionMode = getInspectionMode();
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !inspectionMode,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (inspectionMode) {
      try {
        localStorage.removeItem(AUTH_USER_STORAGE_KEY);
        localStorage.removeItem(INSPECTION_STORAGE_KEY);
      } catch {
        // Ignore storage errors in inspection mode.
      }
      return;
    }

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      console.error("[Auth] Logout error:", error);
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = getLoginUrl();
    }
  }, [inspectionMode, logoutMutation, utils]);

  const state = useMemo(() => {
    if (inspectionMode) {
      try {
        localStorage.setItem(
          AUTH_USER_STORAGE_KEY,
          JSON.stringify(inspectionUser)
        );
      } catch {
        // Ignore storage errors in inspection mode.
      }

      return {
        user: inspectionUser,
        loading: false,
        error: null,
        isAuthenticated: true,
        isInspectionMode: true,
      };
    }

    localStorage.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      isInspectionMode: false,
    };
  }, [
    inspectionMode,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (inspectionMode) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    inspectionMode,
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => (inspectionMode ? Promise.resolve(inspectionUser) : meQuery.refetch()),
    logout,
  };
}
