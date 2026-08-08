import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Universal Intake Spine case projection boundary", () => {
  const adapter = read_repo_file("./intake-spine-case-projection.ts");
  const analyze_router = read_repo_file("./routers/analyze.ts");
  const timeline = read_repo_file("../client/src/pages/Timeline.tsx");
  const chronology_projection = read_repo_file("../client/src/lib/chronologyProjection.ts");

  it("reads sealed canonical layer outputs without mutating legacy case tables", () => {
    expect(adapter).toContain("public.intake_layer_runs");
    expect(adapter).toContain("public.intake_artifacts");
    expect(adapter).toContain("artifact_type = 'intake_layer_output'");
    expect(adapter).toContain("ilr.run_status = 'completed'");
    expect(adapter).toContain("ilr.is_sealed = true");
    expect(adapter).not.toMatch(/insert\s+into\s+public\.(events|entities|findings|relationships)/i);
    expect(adapter).not.toMatch(/update\s+public\.(events|entities|findings|relationships)/i);
    expect(adapter).not.toMatch(/delete\s+from\s+public\.(events|entities|findings|relationships)/i);
  });

  it("exposes the projection through the protected case-owned analyze router", () => {
    expect(analyze_router).toContain("getIntakeSpineLayerProjection: protectedProcedure");
    expect(analyze_router).toContain("verifyCaseOwnership(input.caseId, ctx.user.id)");
    expect(analyze_router).toContain("get_intake_spine_case_layer_projections");
  });

  it("renders sealed Intake chronology directly in the existing Timeline surface", () => {
    expect(timeline).toContain("trpc.analyze.getIntakeSpineLayerProjection.useQuery");
    expect(timeline).toContain('layerName: "chronology_reconstruction"');
    expect(timeline).toContain("project_intake_event_to_chronology");
    expect(timeline).toContain("receipt_hash: projection.receipt_hash");
    expect(timeline).not.toContain("Upload and analyze documents to populate the factual record");
  });

  it("preserves canonical provenance in the read-only chronology projection", () => {
    expect(chronology_projection).toContain("intake_session:");
    expect(chronology_projection).toContain("artifact:");
    expect(chronology_projection).toContain("source_offset:");
    expect(chronology_projection).toContain("receipt:");
    expect(chronology_projection).toContain("output:");
  });
});
