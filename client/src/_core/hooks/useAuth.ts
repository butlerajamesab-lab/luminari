import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const OWNER_RECOVERY_BYPASS = import.meta.env.VITE_OWNER_RECOVERY_BYPASS === "true";

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
  const ownerRecoveryUser = OWNER_RECOVERY_BYPASS ? getOwnerRecoveryUser() : null;

  useEffect(() => {
    if (!OWNER_RECOVERY_BYPASS) return;
    console.warn("[OWNER_RECOVERY_BYPASS_ACTIVE] temporary owner recovery access enabled");
  }, []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !OWNER_RECOVERY_BYPASS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (OWNER_RECOVERY_BYPASS) {
      console.warn("[OWNER_RECOVERY_BYPASS_ACTIVE] logout ignored while temporary owner recovery bypass is enabled");
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
  }, [logoutMutation, utils]);

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
      loading: OWNER_RECOVERY_BYPASS ? false : meQuery.isLoading || logoutMutation.isPending,
      error: OWNER_RECOVERY_BYPASS ? null : meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
      ownerRecoveryBypassActive: OWNER_RECOVERY_BYPASS,
    };
  }, [
    ownerRecoveryUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (OWNER_RECOVERY_BYPASS) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => OWNER_RECOVERY_BYPASS ? Promise.resolve({ data: ownerRecoveryUser } as any) : meQuery.refetch(),
    logout,
  };
}
