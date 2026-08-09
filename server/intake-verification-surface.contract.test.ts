import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const findings = readFileSync(resolve(here, "../client/src/pages/Findings.tsx"), "utf8");
const analyze = readFileSync(resolve(here, "routers/analyze.ts"), "utf8");

describe("Intake verification presentation contract", () => {
  it("exposes Layer 5 verification as a separate canonical surface", () => {
    expect(analyze).toContain("getIntakeVerificationProjection");
    expect(analyze).toContain("'verification_gate'");
    expect(findings).toContain('value="verification"');
    expect(findings).toContain("Verification records are evidence posture, not legal conclusions");
  });

  it("does not silently reclassify verification records as legacy findings", () => {
    expect(findings).toContain("Legacy Findings");
    expect(findings).toContain("Universal Intake verification is shown separately");
    expect(findings).toContain("not silently recast as a finding");
    expect(findings).toContain("No narrative findings are committed for this case");
  });

  it("removes legacy AI attribution from the current Findings header", () => {
    expect(findings).not.toContain("AI-extracted findings");
    expect(findings).toContain("Deterministic verification records");
  });

  it("preserves explicit completed-zero and unresolved semantics", () => {
    expect(findings).toContain("Verification completed with zero fact records");
    expect(findings).toContain("Unresolved dependencies");
    expect(findings).toContain("it is not presented as proof that no facts exist");
  });
});
