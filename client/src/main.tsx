import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { initializeValidationSession } from "./_core/validation-session";
import { ClickToReadProvider } from "./contexts/ClickToReadContext";
import { CivicGenomeRosettaProgressControl } from "./components/CivicGenomeRosettaProgressControl";
import "./index.css";

// Initialize validation session for /intake and /case/:id routes
initializeValidationSession().catch(console.error);

function is_non_retryable_runtime_error(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    "timeout exceeded when trying to connect",
    "pool acquire timed out",
    "pool is saturated",
    "application_pool_saturated",
    "request timed out",
  ].some(fragment => message.includes(fragment));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on cancel errors or auth errors
        if (error instanceof TRPCClientError) {
          if (error.message === UNAUTHED_ERR_MSG) return false;
          if (error.message?.includes('cancel')) return false;
        }
        // Replaying database saturation multiplies pressure on the same pool
        // and keeps read-only screens in a misleading loading state. Surface
        // the first bounded failure and let the user retry deliberately.
        if (is_non_retryable_runtime_error(error)) return false;
        return failureCount < 2;
      },
      staleTime: 10000,
    },
    mutations: {
      retry: false,
    },
  },
});

// Suppress benign AbortError / cancel errors from crashing the app
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('cancel') || event.error?.name === 'AbortError') {
    event.preventDefault();
    console.warn('[Suppressed] Benign abort/cancel error:', event.error?.message);
  }
  // TEMPORARY: Suppress auth errors
  if (event.error?.message?.includes('UNAUTHORIZED') || event.error?.message?.includes('Unauthorized')) {
    event.preventDefault();
    console.warn('[Suppressed] Auth error:', event.error?.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason?.message?.includes('cancel') || reason?.name === 'AbortError' || reason?.message?.includes('aborted')) {
    event.preventDefault();
    console.warn('[Suppressed] Benign unhandled rejection:', reason?.message);
  }
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  // TEMPORARY: OAuth disabled - no redirects
  return;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    // Don't log cancel/abort errors as they're benign
    if (error?.message?.includes('cancel') || error?.name === 'AbortError') return;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // Don't log cancel/abort errors as they're benign
    if (error?.message?.includes('cancel') || error?.name === 'AbortError') return;
    console.error("[API Mutation Error]", error);
  }
});

// Helper: get a fresh Supabase session token, refreshing if expiring soon
async function with_timeout<T>(promise: Promise<T>, timeout_ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeout_promise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeout_ms}ms`)), timeout_ms);
  });
  try {
    return await Promise.race([promise, timeout_promise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getFreshSessionToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await with_timeout(
      supabase.auth.getSession(),
      3_000,
      "Supabase session lookup",
    );
    const token = sessionData.session?.access_token ?? null;

    if (!token) {
      console.warn('[AUTH] No active Supabase session — user may need to log in again');
      return null;
    }

    // Proactively refresh if token expires within 60 seconds
    const expiresAt = sessionData.session?.expires_at;
    const nowSecs = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - nowSecs < 60) {
      console.log('[AUTH] Token expiring soon, refreshing...');
      const { data: refreshData, error } = await with_timeout(
        supabase.auth.refreshSession(),
        5_000,
        "Supabase session refresh",
      );
      if (error) {
        console.warn('[AUTH] Session refresh failed:', error.message);
        return token; // Fall back to existing token
      }
      return refreshData.session?.access_token ?? token;
    }

    return token;
  } catch (err) {
    console.warn('[AUTH] Error getting session token:', err);
    return null;
  }
}

/**
 * Plain same-origin fetches do not pass through the tRPC link. Mission Control
 * uses several protected REST diagnostics, so forward the same Supabase
 * session header to a narrow allowlist of administrator REST surfaces. Never
 * attach the token to another origin.
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
const AUTHENTICATED_REST_PREFIXES = [
  "/api/db-diagnostic",
  "/api/system/",
  "/api/conveyor/",
  "/api/ingestion-control/",
  "/api/executor/",
] as const;

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function shouldForwardSupabaseSession(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  if (!url || url.origin !== window.location.origin) return false;
  return AUTHENTICATED_REST_PREFIXES.some(prefix =>
    prefix.endsWith("/") ? url.pathname.startsWith(prefix) : url.pathname === prefix,
  );
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!shouldForwardSupabaseSession(input)) {
    return nativeFetch(input, init);
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("x-lighthouse-supabase-session")) {
    const sessionToken = await getFreshSessionToken();
    if (sessionToken) headers.set("x-lighthouse-supabase-session", sessionToken);
  }

  return nativeFetch(input, {
    ...(init ?? {}),
    headers,
    credentials: "include",
  });
};

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const headers = new Headers(init?.headers);
        const sessionToken = await getFreshSessionToken();

        if (sessionToken) {
          headers.set("x-lighthouse-supabase-session", sessionToken);
        } else {
          console.warn('[AUTH] tRPC call proceeding without auth token — expect 10001 if route is protected');
        }

        const request_url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
        const bounded_runtime_read = request_url.includes("civicGenome.")
          || request_url.includes("uploadSessions.getActive");
        if (!bounded_runtime_read) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            headers,
            credentials: "include",
          });
        }

        const controller = new AbortController();
        const upstream_signal = init?.signal;
        const forward_abort = () => controller.abort(upstream_signal?.reason);
        if (upstream_signal?.aborted) forward_abort();
        else upstream_signal?.addEventListener("abort", forward_abort, { once: true });
        const timeout = setTimeout(() => {
          controller.abort(new Error("Lighthouse request timed out after 12000ms"));
        }, 12_000);

        try {
          return await globalThis.fetch(input, {
            ...(init ?? {}),
            headers,
            credentials: "include",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
          upstream_signal?.removeEventListener("abort", forward_abort);
        }
      },
    }),
  ],
});

function AppWithProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <ClickToReadProvider>
          <App />
          <CivicGenomeRosettaProgressControl />
        </ClickToReadProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
