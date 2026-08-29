import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Signal Architecture artifact navigation contract", () => {
  const migration = read("../supabase/migrations/20260823015442_signal_artifact_case_links_v1.sql");
  const runtime = read("./signal-artifact-runtime.ts");
  const page = read("../client/src/pages/SignalRegistry.tsx");
  const context = read("../client/src/components/signal-architecture/SignalArtifactContext.tsx");
  const controlRoom = read("../client/src/pages/ControlRoom.tsx");

  it("keeps Atlas ownership and reads only Lighthouse canonical projections", () => {
    expect(runtime).toContain("public.legal_patterns");
    expect(runtime).toContain("public.live_data_signals");
    expect(runtime).toContain("public.signal_convergences");
    expect(runtime).not.toMatch(/insert into public\.(legal_patterns|live_data_signals|signal_convergences)/i);
    expect(runtime).not.toContain("public.detected_signals");
    expect(runtime).not.toContain("public.live_signals");
  });

  it("makes the domain browser paginated, searchable, and click-through", () => {
    expect(page).toContain("list_signal_artifacts.useQuery");
    expect(page).toContain("Next {PAGE_SIZE}");
    expect(page).toContain("Previous {PAGE_SIZE}");
    expect(page).toContain("Canonical artifact explorer");
    expect(page).toContain("open_artifact(record.domain_code, record.record_id)");
    expect(page).toContain("Open in {artifact_detail_query.data.home_label}");
  });

  it("routes source-bound artifacts into their existing Lighthouse homes", () => {
    expect(runtime).toContain('home_path: "/viewfinder"');
    expect(runtime).toContain('home_path: "/diagnostics"');
    expect(runtime).toContain('home_path: "/contradiction-scoring"');
    expect(runtime).toContain('home_path: "/integrity-review"');
    expect(context).toContain("get_signal_artifact.useQuery");
    expect(context).toContain("Why this matters here");
  });

  it("creates a fail-closed, source-hash-bound case relationship receipt", () => {
    expect(migration).toContain("signal_artifact_case_links_v1");
    expect(migration).toContain("num_nonnulls(");
    expect(migration).toContain("artifact_source_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(runtime).toContain("verifyCaseWriteAccess(input.case_id, input.user_id)");
    expect(page).toContain("It does not create a finding, prove wrongdoing, or change the artifact");
    expect(controlRoom).toContain("Connected Signal Architecture Artifacts");
  });
});
