import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected REST and Atlas service boundary", () => {
  const trpcClient = readFileSync("client/src/lib/trpc.ts", "utf8");
  const protectedRest = readFileSync(
    "client/src/lib/protected-rest-auth.ts",
    "utf8",
  );
  const sessionToken = readFileSync(
    "client/src/lib/session-token.ts",
    "utf8",
  );
  const atlasProxy = readFileSync(
    "server/routes/atlas-proxy-router.ts",
    "utf8",
  );

  it("installs one bounded browser authentication transport", () => {
    expect(trpcClient).toContain("installProtectedRestAuthTransport()");
    expect(protectedRest).toContain('"/api/executor"');
    expect(protectedRest).toContain('"/api/system"');
    expect(protectedRest).toContain('"/api/atlas"');
    expect(protectedRest).toContain('"/api/ingestion-control"');
    expect(protectedRest).toContain('"/api/upload"');
    expect(protectedRest).toContain('"/api/cases"');
    expect(protectedRest).toContain("url.origin !== window.location.origin");
    expect(protectedRest).toContain("getAuthenticatedRequestHeaders");
    expect(sessionToken).toContain('headers.set("x-lighthouse-supabase-session"');
  });

  it("retrieves private evidence source links through authenticated fetch rather than bare navigation", () => {
    expect(protectedRest).toContain("isPrivateDocumentBridgeUrl");
    expect(protectedRest).toContain('/^\\/api\\/cases\\/\\d+\\/documents\\/file$/');
    expect(protectedRest).toContain('document.addEventListener(\n    "click"');
    expect(protectedRest).toContain("event.preventDefault()");
    expect(protectedRest).toContain("redirect: \"follow\"");
    expect(protectedRest).toContain("response.blob()");
    expect(protectedRest).toContain("blob.size === 0");
  });

  it("keeps Atlas health public while gating all operational routes", () => {
    expect(atlasProxy).toContain('atlasProxyRouter.get("/health"');
    expect(atlasProxy).toContain(
      'atlasProxyRouter.get("/catalog", requireExpressAdmin',
    );
    expect(atlasProxy).toContain(
      'atlasProxyRouter.post("/populate", requireExpressAdmin',
    );
    expect(atlasProxy).toContain(
      'atlasProxyRouter.post("/bridge-drain", requireExpressAdmin',
    );
  });

  it("uses the private Atlas control credential and canonical bridge action", () => {
    expect(atlasProxy).toContain("process.env.ATLAS_CONTROL_TOKEN");
    expect(atlasProxy).toContain(
      'headers.set("Authorization", `Bearer ${controlToken}`)',
    );
    expect(atlasProxy).toContain('"/scheduler/live-data-signals"');
    expect(atlasProxy).not.toContain('"/scheduler/bridge-drain"');
    expect(atlasProxy).not.toContain("x-lighthouse-supabase-session");
  });
});
