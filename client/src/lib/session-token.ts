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

/**
 * Return the current Supabase access token, refreshing it when expiry is close.
 * Raw HTTP routes and tRPC must use this same transport contract.
 */
export async function getFreshSessionToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await withTimeout(
      supabase.auth.getSession(),
      3_000,
      "Supabase session lookup",
    );
    const token = sessionData.session?.access_token ?? null;

    if (!token) {
      console.warn("[AUTH] No active Supabase session — user may need to log in again");
      return null;
    }

    const expiresAt = sessionData.session?.expires_at;
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (expiresAt && expiresAt - nowSeconds < 60) {
      const { data: refreshData, error } = await withTimeout(
        supabase.auth.refreshSession(),
        5_000,
        "Supabase session refresh",
      );
      if (error) {
        console.warn("[AUTH] Session refresh failed:", error.message);
        return token;
      }
      return refreshData.session?.access_token ?? token;
    }

    return token;
  } catch (error) {
    console.warn("[AUTH] Error getting session token:", error);
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

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = await getAuthenticatedRequestHeaders(init.headers);
  return globalThis.fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
}

export async function downloadAuthenticatedFile(
  input: RequestInfo | URL,
  filename?: string,
): Promise<void> {
  const response = await authenticatedFetch(input, {
    headers: { Accept: "application/octet-stream, application/zip, text/html" },
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    let message = body.slice(0, 240).trim();
    if (contentType.includes("application/json") && body) {
      try {
        const parsed = JSON.parse(body);
        const candidate = parsed.error ?? parsed.message;
        if (typeof candidate === "string") message = candidate;
      } catch {
        // Keep the bounded response text when JSON parsing fails.
      }
    }
    throw new Error(
      message ||
        `Download failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`,
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  if (filename) anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
}
