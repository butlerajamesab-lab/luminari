import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Lighthouse primary intake runtime authority", () => {
  const analyze = read_repo_file("./routers/analyze.ts");
  const control = read_repo_file("../client/src/components/lighthouse/IntakeSpineControl.tsx");

  it("restricts both execution and status to the promoted primary projection", () => {
    expect(analyze.match(/cil\.is_primary = true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(analyze.match(/cil\.link_type = 'primary_projection'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(analyze).not.toContain("intake_spine_runtime_multiple_live_upload_sessions_require_explicit_session_id");
  });

  it("does not expose historical intake-session selection in the operational control", () => {
    expect(control).not.toContain("selectedSessionId");
    expect(control).not.toContain("Select a session");
    expect(control).not.toContain("liveUploadSessions.length > 1");
  });

  it("reuses the case's declared governed boundary after evidence changes", () => {
    expect(analyze).toContain("last_governed_jurisdiction");
    expect(analyze).toContain("last_governed_rule_as_of");
    expect(analyze).toContain("projection_invalidated_at");
    expect(control).toContain("selectedSession?.last_governed_jurisdiction");
    expect(control).toContain("New documents were added after the last review");
  });

  it("keeps governed execution explicit while presenting the primary action in user language", () => {
    expect(control).toContain("runIntakeSpine.mutateAsync");
    expect(control).toContain("Review My Evidence");
    expect(control).toContain("Case settings & audit details");
    expect(control).not.toContain("Run Universal Intake Spine");
    expect(control).not.toContain("INTAKE_STATUS_READ");
  });
});
