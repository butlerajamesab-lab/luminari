import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("browser REST authentication boundary", () => {
  it("provides one Supabase-aware transport for non-tRPC routes", () => {
    const transport = read("client/src/lib/session-token.ts");

    expect(transport).toContain("export async function authenticatedFetch");
    expect(transport).toContain(
      "await getAuthenticatedRequestHeaders(init.headers)",
    );
    expect(transport).toContain('credentials: init.credentials ?? "include"');
    expect(transport).toContain(
      "export async function downloadAuthenticatedFile",
    );
  });

  it("authenticates every administrator REST surface used by the active UI", () => {
    const mission = read(
      "client/src/hooks/mission/useMissionControlSchemaLedger.ts",
    );
    const sovereign = read("client/src/pages/SovereignControl.tsx");
    const ingestion = read("client/src/pages/ingestion_control.tsx");
    const atlas = read("client/src/lib/atlasApi.ts");

    expect(mission).toContain("authenticatedFetch(SCHEMA_LEDGER_ENDPOINT");
    expect(sovereign).toContain(
      "authenticatedFetch(`/api/executor/${endpoint}`",
    );
    expect(sovereign).not.toMatch(/await fetch\("\/api\/executor/);
    expect(ingestion).toContain(
      'authenticatedFetch as fetch } from "@/lib/session-token"',
    );
    expect(atlas).toContain("authenticatedFetch(`/api/atlas${path}`");
  });

  it("uses authenticated blob flows for restored download surfaces", () => {
    for (const path of [
      "client/src/pages/CdaRunList.tsx",
      "client/src/pages/CdaRunDetail.tsx",
      "client/src/pages/ImportBundle.tsx",
      "client/src/pages/Welcome.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("downloadAuthenticatedFile");
      expect(source, path).not.toMatch(
        /window\.open\([^\n]*\/api\/(?:cda|bundle)/,
      );
    }

    const exports = read("client/src/pages/Exports.tsx");
    const docket = read("client/src/pages/DocketRoom.tsx");
    expect(exports).toContain("authenticatedFetch(url)");
    expect(docket).toContain('authenticatedFetch("/api/docket/upload"');
    expect(docket).toContain('authenticatedFetch("/api/docket/warm-state"');
  });

  it("renders bundle preservation outcomes without claiming analysis", () => {
    const bundle = read("client/src/pages/ImportBundle.tsx");

    expect(bundle).toContain('completion_state: "preserved" | "partial"');
    expect(bundle).toContain("result.document_failures.length > 0");
    expect(bundle).toContain("preservation receipts");
    expect(bundle).not.toContain("queued for analysis");
    expect(bundle).not.toContain("documents are being analyzed");
  });

  it("uses the same request resolver on restored server routes", () => {
    for (const path of [
      "server/export-route.ts",
      "server/cda-export-route.ts",
      "server/bundle-download-route.ts",
      "server/docket-upload-route.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("authenticateRequestUser");
      expect(source, path).not.toContain("sdk.authenticateRequest");
    }
  });
});
