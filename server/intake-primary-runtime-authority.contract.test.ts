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
});
