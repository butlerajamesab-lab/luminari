import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const provenance = readFileSync(resolve(here, "../client/src/pages/Provenance.tsx"), "utf8");
const integrity = readFileSync(resolve(here, "../client/src/pages/IntegrityDashboard.tsx"), "utf8");

describe("truthful provenance and integrity state semantics", () => {
  it("does not call zero findings successful provenance", () => {
    expect(provenance).toContain("metrics?.totalFindings");
    expect(provenance).toContain("No finding population to evaluate");
    expect(provenance).toContain("there are no findings to test for source linkage");
    expect(provenance).not.toContain("All findings have provenance");
  });

  it("only presents all-existing-findings provenance success after a nonzero population is established", () => {
    expect(provenance).toContain("totalFindings === 0");
    expect(provenance).toContain("totalFindings === undefined");
    expect(provenance).toContain("All existing findings have provenance");
    expect(provenance).toContain('value={metrics.totalFindings === 0 ? "N/A"');
  });

  it("does not substitute legacy snapshot health for canonical intake integrity", () => {
    expect(integrity).toContain("No legacy snapshot state was substituted");
    expect(integrity).toContain('projection.projection_state === "not_run"');
    expect(integrity).not.toContain("no active integrity issues");
  });

  it("requires canonical Layer 3 state before showing canonical verification", () => {
    expect(integrity).toContain('projection.projection_state === "not_run"');
    expect(integrity).toContain('projection.projection_state === "blocked"');
    expect(integrity).toContain("Preservation verified");
    expect(integrity).toContain("pendingCount");
  });
});
