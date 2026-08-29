import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Universal Intake Spine canonical execution boundary", () => {
  const control_room = read_repo_file("../client/src/pages/ControlRoom.tsx");
  const intake_spine_control = read_repo_file("../client/src/components/lighthouse/IntakeSpineControl.tsx");
  const guided_dashboard = read_repo_file("../client/src/pages/GuidedDashboard.tsx");
  const dashboard_layout = read_repo_file("../client/src/components/DashboardLayout.tsx");
  const upload_page = read_repo_file("../client/src/pages/Upload.tsx");
  const documents_page = read_repo_file("../client/src/pages/Documents.tsx");
  const upload_route = read_repo_file("./upload-route.ts");

  it("does not let Control Room masquerade downstream engines as canonical case analysis", () => {
    expect(control_room).toContain("<IntakeSpineControl caseId={caseId} />");
    expect(control_room).toContain("Layer 14 candidates");
    expect(control_room).toContain("getIntakeActionPathProjection");
    expect(control_room).toContain("getIntakeStructuralSignalProjection");
    expect(control_room).not.toContain("trpc.findings.listEnriched");
    expect(control_room).not.toContain("trpc.strategyEngine.getStrategyPaths");
    expect(control_room).not.toContain("incidentDate: Date.now()");
    expect(control_room).not.toContain('jurisdiction: "federal"');
    expect(control_room).not.toContain("async function runPipeline()");
  });

  it("exposes one real governed control with declared execution inputs", () => {
    expect(intake_spine_control).toContain("trpc.analyze.getIntakeSpineStatus.useQuery");
    expect(intake_spine_control).toContain("trpc.analyze.runIntakeSpine.useMutation");
    expect(intake_spine_control).toContain("Case jurisdiction");
    expect(intake_spine_control).toContain("Confirm the case jurisdiction");
    expect(intake_spine_control).toContain("Review rules as of");
    expect(intake_spine_control).toContain("Review My Evidence");
    expect(intake_spine_control).not.toContain('jurisdiction: "federal"');
    expect(intake_spine_control).not.toContain("14 sealed");
  });

  it("replaces generic case-facing analysis prompts while retaining specifically named downstream tools", () => {
    expect(guided_dashboard).toContain("<IntakeSpineControl caseId={caseId} />");
    expect(guided_dashboard).toContain('["Upload", "Intake Spine", "Review", "Export"]');
    expect(guided_dashboard).not.toContain("Ready to analyze");
    expect(guided_dashboard).not.toContain("Start Analysis");
    expect(guided_dashboard).not.toContain("Go to Documents to start analysis");

    expect(dashboard_layout).toContain('["Upload", "Intake", "Review", "Act"]');
    expect(dashboard_layout).not.toContain("Analyze Evidence");
    expect(dashboard_layout).not.toContain("Run analysis to extract findings from your documents");

    expect(upload_page).toContain("Open the Universal Intake Spine");
    expect(upload_page).not.toContain("Run Analysis when you're ready");
    expect(documents_page).toContain("Run Claim Denial Analysis");
    expect(documents_page).not.toMatch(/>\s*Run Analysis\s*</);
  });

  it("keeps both new and replacement uploads on the registration side of the boundary", () => {
    expect(upload_route).not.toContain('from "./analysis-pipeline"');
    expect(upload_route).not.toContain("enqueueDocument(");
    expect(upload_route).toContain("source registered for explicit Intake Spine execution");
    expect(upload_route).toContain("snapshotId: null");
    expect(upload_route).not.toContain("performDuplicateOverride");
  });
});
