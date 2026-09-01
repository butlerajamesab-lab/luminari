import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const state = useMemo(() => ({
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.email?.split("@")[0] ?? "User",
      role: "admin",
      authenticated: true,
    } : null,
    loading,
    error: null,
    isAuthenticated: Boolean(session),
  }), [session, loading]);

  return {
    ...state,
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      return state.user;
    },
    logout,
  };
}
