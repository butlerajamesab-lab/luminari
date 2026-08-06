import { supabase } from "@/lib/supabase";

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getFreshSessionToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await withTimeout(
      supabase.auth.getSession(),
      3_000,
      "Supabase session lookup",
    );
    const token = sessionData.session?.access_token ?? null;

    if (!token) return null;

    const expiresAt = sessionData.session?.expires_at;
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (expiresAt && expiresAt - nowSeconds < 60) {
      const { data: refreshData, error } = await withTimeout(
        supabase.auth.refreshSession(),
        5_000,
        "Supabase session refresh",
      );
      if (error) return token;
      return refreshData.session?.access_token ?? token;
    }

    return token;
  } catch (error) {
    console.warn("[AUTH] Session token lookup failed", error);
    return null;
  }
}

export async function getAuthenticatedRequestHeaders(
  initialHeaders?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(initialHeaders);
  const sessionToken = await getFreshSessionToken();
  if (sessionToken) {
    headers.set("x-lighthouse-supabase-session", sessionToken);
  }
  return headers;
}
