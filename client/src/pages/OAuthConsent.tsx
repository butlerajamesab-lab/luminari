import { useEffect, useState } from "react";
import { getLoginUrl } from "@/const";
import { supabase } from "@/lib/supabase";

// Both dashboard-side OAuth configuration and this explicit rollout flag
// are required. Off by default; does not affect Lighthouse sign-in/invites.
export const LIGHTHOUSE_OAUTH_CONSENT_ENABLED =
  import.meta.env.VITE_LIGHTHOUSE_OAUTH_CONSENT_ENABLED === "true";

type AuthorizationRequest = {
  authorization_id: string;
  client: { name: string };
  redirect_uri: string;
  scope?: string;
};

function isAuthorizationRequest(value: unknown): value is AuthorizationRequest {
  if (!value || typeof value !== "object") return false;
  const details = value as Record<string, unknown>;
  const client = details.client;
  return typeof details.authorization_id === "string"
    && typeof details.redirect_uri === "string"
    && !!client
    && typeof client === "object"
    && typeof (client as Record<string, unknown>).name === "string";
}

function verifiedRedirect(value: unknown): string | null {
  // Never redirect to a caller-supplied query argument. Only the Supabase
  // authorization API's response may determine the client destination.
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (import.meta.env.DEV && url.hostname === "localhost")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default function OAuthConsent() {
  const [request, setRequest] = useState<AuthorizationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authorization_id = new URLSearchParams(window.location.search).get("authorization_id");

  useEffect(() => {
    if (!LIGHTHOUSE_OAUTH_CONSENT_ENABLED) {
      setLoading(false);
      return;
    }
    if (!authorization_id) {
      setError("Missing authorization request.");
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: identity, error: auth_error } = await supabase.auth.getUser();
        // No Supabase session is the ordinary first-time OAuth path, not a
        // fatal consent failure. All other Auth errors remain explicit.
        if (auth_error && auth_error.name !== "AuthSessionMissingError") throw auth_error;
        if (!identity.user) {
          const return_path = "/oauth/consent?" + new URLSearchParams({
            authorization_id,
          }).toString();
          window.location.assign(getLoginUrl(return_path));
          return;
        }

        const { data, error: details_error } =
          await supabase.auth.oauth.getAuthorizationDetails(authorization_id);
        if (details_error) throw details_error;
        if (!active) return;

        // Supabase may skip the consent prompt if a user previously approved.
        if (data && !("authorization_id" in data) && "redirect_url" in data) {
          const redirect_url = verifiedRedirect(data.redirect_url);
          if (!redirect_url) throw new Error("Authorization destination was invalid.");
          window.location.assign(redirect_url);
          return;
        }

        if (!isAuthorizationRequest(data)) {
          throw new Error("Authorization details could not be verified.");
        }
        setRequest(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Authorization failed.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authorization_id]);

  async function decide(approve: boolean) {
    if (!request || acting || !authorization_id) return;
    setError(null);
    setActing(true);
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true });
      if (result.error) throw result.error;
      const redirect_url = verifiedRedirect(result.data?.redirect_url);
      if (!redirect_url) throw new Error("Authorization destination was invalid.");
      window.location.assign(redirect_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
      setActing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 space-y-5">
        <h1 className="text-xl font-semibold">Luminari · Connected Account Access</h1>
        {!LIGHTHOUSE_OAUTH_CONSENT_ENABLED ? (
          <p role="status" className="text-sm text-slate-300">Cross-platform authorization is not enabled.</p>
        ) : loading ? (
          <p role="status" className="text-sm text-slate-300">Checking your account and the requesting application…</p>
        ) : (
          <>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            {request && (
              <>
                <p className="text-sm">
                  <strong>{request.client.name}</strong> is asking to connect to your Luminari account.
                </p>
                <p className="text-xs text-slate-300 break-all">
                  Requested callback: {request.redirect_uri}
                </p>
                <div>
                  <p className="text-sm font-medium">Requested identity information</p>
                  <ul className="list-disc pl-5 text-sm text-slate-300">
                    {(request.scope?.split(/\s+/).filter(Boolean) ?? []).map(scope => (
                      <li key={scope}>{scope}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-slate-400">
                  Connecting an account does not grant this application administrator access
                  or permission to bypass its own case ownership controls.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => void decide(false)}
                    className="flex-1 rounded-md border border-slate-600 px-4 py-2 disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => void decide(true)}
                    className="flex-1 rounded-md bg-teal-600 px-4 py-2 font-medium disabled:opacity-50"
                  >
                    Authorize
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
