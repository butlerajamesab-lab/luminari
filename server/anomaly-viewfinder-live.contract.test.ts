import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Anomaly Viewfinder live jurisdiction cutover contract", () => {
  const page = read("../client/src/pages/AnomalyViewfinder.tsx");
  const service = read("./services/anomaly-viewfinder-live.ts");
  const router = read("./routers/resource-directory.ts");
  const migration = read("../supabase/migrations/20260816111545_anomaly_viewfinder_live_jurisdiction_projection_v1.sql");
  const parity = read("../scripts/audit-supabase-migration-ledger-parity.py");
  const productionReceipts = read("../supabase/verification/production_migration_receipts_20260829.tsv");

  it("removes the static jurisdiction fact feed from the Viewfinder page", () => {
    expect(page).not.toMatch(/import\s*\{[^}]*\bSTATES\b/);
    expect(page).toContain('import { trpc } from "@/lib/trpc"');
    expect(page).toContain("resourceDirectory.viewfinderStates.useQuery");
    expect(page).toContain("No static state-fact fallback was used");
  });

  it("keeps unsupported values explicit instead of silently filling them", () => {
    expect(page).toContain('return value?.trim() || "Unknown"');
    expect(page).toContain('state.lgbtq === null ? "Unknown"');
    expect(page).toContain("Unknown stays Unknown");
    expect(page).not.toContain("No — EEOC only");
  });

  it("routes the browser through the existing governed tRPC seam", () => {
    expect(router).toContain("viewfinderStates: publicProcedure.query");
    expect(router).toContain("getLiveAnomalyViewfinderStates");
    expect(service).toContain('public.v_anomaly_viewfinder_live_v1');
    expect(service).not.toMatch(/\$\{\s*input/i);
  });

  it("keeps the database projection service-role only", () => {
    expect(migration).toContain("revoke all on public.v_anomaly_viewfinder_live_v1 from public");
    expect(migration).toContain("revoke all on public.v_anomaly_viewfinder_live_v1 from anon");
    expect(migration).toContain("revoke all on public.v_anomaly_viewfinder_live_v1 from authenticated");
    expect(migration).toContain("grant select on public.v_anomaly_viewfinder_live_v1 to service_role");
  });

  it("preserves source-bound Colorado fallback and provenance", () => {
    expect(migration).toContain("current_corpus_fallback");
    expect(migration).toContain("corpus_fallback");
    expect(migration).toContain("source_candidate_hash");
    expect(migration).toContain("record_fingerprint");
    expect(page).toContain("Source-bound corpus fallback");
  });

  it("records the exact production migration version without weakening parity", () => {
    expect(parity).toContain("PRODUCTION_RECEIPTS");
    expect(productionReceipts).toContain(
      "20260816111545\tanomaly_viewfinder_live_jurisdiction_projection_v1\t",
    );
    expect(parity).toContain("MIGRATION_LEDGER_PARITY_CONTRACT=PASS");
  });

  it("separates historical interpretive cards from live jurisdiction facts", () => {
    expect(page).toContain("Interpretive layer:");
    expect(page).toContain("not the live jurisdiction fact feed");
    expect(page).toContain("Raw source text is authoritative");
  });
});
