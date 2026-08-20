import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");

describe("Lighthouse intake runtime topology cutover", () => {
  const routers = read("server/routers.ts");
  const analyze = read("server/routers/analyze.ts");
  const upload = read("server/upload-route.ts");
  const bundleSync = read("server/bundle-sync.ts");
  const layerReader = read("server/intake-case-layer-reader.ts");
  const runtimeProjection = read("server/intake-case-runtime-projection.ts");
  const chronologyProjection = read("server/case-runtime-chronology-compat.ts");
  const home = read("client/src/pages/Home.tsx");
  const controlRoom = read("client/src/pages/ControlRoom.tsx");
  const migration = read("supabase/migrations/20260808231628_promote_live_upload_intake_authority.sql");

  it("removes legacy intake executors and routes from the runtime", () => {
    for (const path of [
      "server/analysis-pipeline.ts",
      "server/extraction-recovery.ts",
      "server/routers/extraction.ts",
      "server/routers-complete.ts",
      "server/scripts/extract-now.ts",
      "server/scripts/run-extraction.ts",
      "client/src/pages/ClaimDenialAnalysis.tsx",
      "client/src/pages/ExtractionDashboard.tsx",
      "client/src/pages/SpineViewer.tsx",
    ]) {
      expect(existsSync(resolve(repo, path)), `${path} must not ship`).toBe(false);
    }
    expect(routers).not.toContain("snapshotsRouter");
    expect(routers).not.toContain("phase2Router");
    expect(routers).not.toContain("triggerReanalysis");
    expect(routers).not.toContain("fullSnapshotRebuild");
  });

  it("does not advertise retired intake routes through runtime manifests", () => {
    expect(existsSync(resolve(repo, "server/routes/ai-inspect-router.ts"))).toBe(false);
    const runtimeManifests = read("server/routes/system-visibility-router.ts");
    for (const retiredRouteDeclaration of [
      'path: "/claim-denial-analysis"',
      'path: "/extraction"',
      'path: "/spine/:caseId/:snapshotId"',
      'path: "/spine-viewer"',
      'page: "/spine-viewer"',
    ]) {
      expect(runtimeManifests).not.toContain(retiredRouteDeclaration);
    }
  });

  it("keeps every upload path on exact-byte registration with no implicit execution", () => {
    for (const source of [upload, bundleSync]) {
      expect(source).toContain("snapshotId: null");
      expect(source).not.toContain("createCorpusSnapshot(");
      expect(source).not.toContain("performDuplicateOverride(");
      expect(source).not.toContain("analyzeDocument(");
    }
    expect(bundleSync).not.toContain("createEvent(");
    expect(bundleSync).not.toContain("findOrCreateEntity(");
    expect(bundleSync).toContain('intakeStatus: "evidence_registered"');
  });

  it("reads only the completed live upload authority for case projections", () => {
    for (const projection of [layerReader, runtimeProjection, chronologyProjection]) {
      expect(projection).toContain("s.session_type = 'live'");
      expect(projection).toContain("s.entry_channel = 'upload'");
      expect(projection).toContain("s.completion_state = 'governed_execution_complete'");
    }
  });

  it("binds all Lighthouse status and action panels to governed projections", () => {
    expect(analyze).toContain("runIntakeSpine");
    expect(analyze).toContain("getIntakeSpineStatus");
    expect(analyze).toContain("getIntakeVerificationProjection");
    expect(analyze).toContain("getIntakeActionPathProjection");
    expect(analyze).toContain("getIntakeStructuralSignalProjection");
    expect(home).toContain("<IntakeSpineControl");
    expect(home).not.toContain("{ enabled: false }");
    expect(controlRoom).not.toContain("trpc.strategyEngine.getStrategyPaths");
    expect(controlRoom).not.toContain("trpc.findings.listEnriched");
  });

  it("promotes the live upload session and invalidates stale execution on evidence changes", () => {
    expect(migration).toContain("promote_live_upload_intake_authority_v1");
    expect(migration).toContain("link_type = 'primary_projection'");
    expect(migration).toContain("completion_state = 'evidence_registered'");
    expect(migration).toContain("after insert or update of document_resolution, replaced_by_document_id");
    expect(migration).toContain("pg_advisory_xact_lock");
  });
});
