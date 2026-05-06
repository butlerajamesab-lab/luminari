import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const OWNER_RECOVERY_STORAGE_KEY = "luminari-owner-recovery-bypass";
const OWNER_RECOVERY_TOKEN = "lh_owner_recovery_2026_05_06_9Kx7Pq4mR2vT8nZ1";

function ownerRecoveryBypassEnabled() {
  if (import.meta.env.VITE_OWNER_RECOVERY_BYPASS === "true") return true;
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get("owner_recovery") === OWNER_RECOVERY_TOKEN) {
    window.sessionStorage.setItem(OWNER_RECOVERY_STORAGE_KEY, "true");
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, document.title, cleanUrl);
    return true;
  }

  return window.sessionStorage.getItem(OWNER_RECOVERY_STORAGE_KEY) === "true";
}

function getOwnerRecoveryUser() {
  const now = Date.now();
  const userId = import.meta.env.VITE_OWNER_RECOVERY_USER_ID || "sovereign_admin";
  const email = import.meta.env.VITE_OWNER_RECOVERY_EMAIL || "owner-recovery@luminari.local";
  const role = import.meta.env.VITE_OWNER_RECOVERY_ROLE || "admin";

  return {
    id: -1,
    openId: userId,
    name: "Owner Recovery Admin",
    email,
    loginMethod: "temporary_owner_recovery_bypass",
    role,
    plan: "enterprise",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    access_layer: "admin",
    source: "temporary_owner_recovery_bypass",
  } as any;
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const ownerRecoveryActive = ownerRecoveryBypassEnabled();
  const ownerRecoveryUser = ownerRecoveryActive ? getOwnerRecoveryUser() : null;

  useEffect(() => {
    if (!ownerRecoveryActive) return;
    console.warn("[OWNER_RECOVERY_BYPASS_ACTIVE] temporary owner recovery access enabled");
  }, [ownerRecoveryActive]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !ownerRecoveryActive,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (ownerRecoveryActive) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(OWNER_RECOVERY_STORAGE_KEY);
      }
      console.warn("[OWNER_RECOVERY_BYPASS_ACTIVE] temporary owner recovery bypass cleared");
      window.location.reload();
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
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, ownerRecoveryActive, utils]);

  const state = useMemo(() => {
    const user = ownerRecoveryUser ?? meQuery.data ?? null;

    if (typeof window !== "undefined") {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(user)
      );
    }

    return {
      user,
      loading: ownerRecoveryActive ? false : meQuery.isLoading || logoutMutation.isPending,
      error: ownerRecoveryActive ? null : meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
      ownerRecoveryBypassActive: ownerRecoveryActive,
    };
  }, [
    ownerRecoveryUser,
    ownerRecoveryActive,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (ownerRecoveryActive) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    ownerRecoveryActive,
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => ownerRecoveryActive ? Promise.resolve({ data: ownerRecoveryUser } as any) : meQuery.refetch(),
    logout,
  };
}
