import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Universal Intake Spine canonical execution boundary", () => {
  const control_room = read_repo_file("../client/src/pages/ControlRoom.tsx");
  const upload_route = read_repo_file("./upload-route.ts");

  it("does not let Control Room masquerade downstream engines as canonical case analysis", () => {
    expect(control_room).toContain("trpc.analyze.getIntakeSpineStatus.useQuery");
    expect(control_room).toContain("Open Intake Spine");
    expect(control_room).toContain("Strategy, assembly, and pattern engines remain separately named downstream tools");
    expect(control_room).not.toContain("incidentDate: Date.now()");
    expect(control_room).not.toContain('jurisdiction: "federal"');
    expect(control_room).not.toContain("async function runPipeline()");
  });

  it("keeps both new and replacement uploads on the preservation side of the boundary", () => {
    expect(upload_route).not.toContain('from "./analysis-pipeline"');
    expect(upload_route).not.toContain("enqueueDocument(");
    expect(upload_route).toContain("evidence preserved for explicit Intake Spine execution");
  });
});
