import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const route = read("../client/src/App.tsx");
const consent = read("../client/src/pages/OAuthConsent.tsx");
const login = read("../client/src/pages/Login.tsx");

describe("Lighthouse federated identity consent boundary", () => {
  it("prepares the separate consent route without replacing existing login or invitation", () => {
    expect(route).toContain('<Route path="/oauth/consent" component={OAuthConsent} />');
    const registry = read("../shared/client-route-registry.ts");
    expect(registry).toContain('"/oauth/consent"');
    expect(route).toContain('<Route path="/invite/:token" component={InviteLanding} />');
    expect(route).toContain('<Route path="/welcome" component={Welcome} />');
    expect(login).toContain('supabase.auth.signInWithPassword');
  });

  it("fails closed until explicitly enabled and requires verified user", () => {
    expect(consent).toContain('import.meta.env.VITE_LIGHTHOUSE_OAUTH_CONSENT_ENABLED === "true"');
    expect(consent).toContain('if (!LIGHTHOUSE_OAUTH_CONSENT_ENABLED)');
    expect(consent).toContain("supabase.auth.getUser()");
    expect(consent).toContain('auth_error.name !== "AuthSessionMissingError"');
    expect(consent).toContain("window.location.assign(getLoginUrl(return_path))");
  });

  it("uses Supabase authorization responses, not caller-supplied redirects", () => {
    expect(consent).toContain("supabase.auth.oauth.getAuthorizationDetails(authorization_id)");
    expect(consent).toContain("supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })");
    expect(consent).toContain("supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true })");
    expect(consent).toContain("verifiedRedirect(result.data?.redirect_url)");
    expect(consent).not.toContain('searchParams.get("redirect_uri")');
  });
});
