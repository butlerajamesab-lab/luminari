import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const compat = readFileSync(resolve(here, "provenance-runtime-compat.ts"), "utf8");
const facade = readFileSync(resolve(here, "db.ts"), "utf8");

describe("provenance live-Postgres compatibility", () => {
  it("treats historical boolean storage as explicit integer 0/1 state", () => {
    expect(compat).toContain("f.provenance_attempted = 1");
    expect(compat).toContain("fallback_triggered = 1");
    expect(compat).toContain("provenance_attempted ? 1 : 0");
    expect(compat).toContain("meta.fallbackTriggered ? 1 : 0");
    expect(compat).not.toContain("provenanceAttempted, true");
  });

  it("preserves JSON text columns explicitly instead of relying on drifted field declarations", () => {
    expect(compat).toContain("JSON.stringify(claim_ids)");
    expect(compat).toContain("JSON.stringify(claimIds)");
    expect(compat).toContain("JSON.stringify(meta.matchMetadata)");
    expect(compat).toContain("parse_json_array(row.claim_ids)");
  });

  it("keeps the two-state provenance invariant on legacy finding creation and relinking", () => {
    expect(compat).toContain('claim_ids.length > 0 ? "linked" : "unsupported"');
    expect(compat).toContain("finding has empty claimIds but provenanceStatus='linked'");
    expect(compat).toContain("finding has empty claimIds but provenanceAttempted=false");
    expect(compat).toContain("provenance_attempted = 1");
  });

  it("routes the public db facade through the live compatibility functions", () => {
    expect(facade).toContain('from "./provenance-runtime-compat"');
    expect(facade).toContain("listUnsupportedFindings");
    expect(facade).toContain("getProvenanceDrilldownMetrics");
    expect(facade).toContain("updateFindingClaimIds");
    expect(facade).toContain("updateFindingMatchMetadata");
    expect(facade).toContain("createFinding");
  });
});
