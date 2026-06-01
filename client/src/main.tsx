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
import "./index.css";

// Initialize validation session for /intake and /case/:id routes
initializeValidationSession().catch(console.error);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on cancel errors or auth errors
        if (error instanceof TRPCClientError) {
          if (error.message === UNAUTHED_ERR_MSG) return false;
          if (error.message?.includes('cancel')) return false;
        }
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
async function getFreshSessionToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
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
      const { data: refreshData, error } = await supabase.auth.refreshSession();
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

        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
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
        </ClickToReadProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
