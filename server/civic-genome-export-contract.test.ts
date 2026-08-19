import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = readFileSync(join(root, "server", "routes", "civic-genome-export-router.ts"), "utf8");
const index = readFileSync(join(root, "server", "_core", "index.ts"), "utf8");
const page = readFileSync(join(root, "client", "src", "pages", "CivicGenome.tsx"), "utf8");

describe("Civic Genome JSON export", () => {
  it("exposes real attachment endpoints rather than clipboard-only output", () => {
    expect(route).toContain('civic_genome_export_router.get("/bill/:source_bill_id"');
    expect(route).toContain('civic_genome_export_router.get("/current"');
    expect(route).toContain('Content-Disposition');
    expect(route).toContain('application/json; charset=utf-8');
    expect(route).toContain('JSON.stringify(payload, null, 2)');
    expect(route).not.toContain('clipboard');
  });

  it("keeps deep single-bill export read-only and provenance-rich", () => {
    expect(route).toContain('export_type: "civic_genome_bill_export"');
    expect(route).toContain('bill_versions: versions_result.rows');
    expect(route).toContain('all_structural_traits: all_traits_result.rows');
    expect(route).toContain('all_assembly_runs: all_runs_result.rows');
    expect(route).toContain('bill_events: events');
    expect(route).toContain('lineage_edges: lineage_result.rows');
    expect(route).toContain('family_momentum_snapshots: momentum');
    expect(route).not.toMatch(/delete\s+from/i);
    expect(route).not.toMatch(/update\s+public\./i);
    expect(route).not.toMatch(/insert\s+into\s+public\./i);
  });

  it("bounds the multi-bill proof export without truncating individual JSON records", () => {
    expect(route).toContain('const MULTI_EXPORT_LIMIT = 100;');
    expect(route).toContain('returned_bill_count: bills.length');
    expect(route).toContain('total_bill_count: stats.total_bills');
    expect(route).toContain('max_limit: MULTI_EXPORT_LIMIT');
  });

  it("mounts the export route and surfaces both download controls in Civic Genome", () => {
    expect(index).toContain('civic_genome_export_router');
    expect(index).toContain('app.use("/api/civic-genome/export", civic_genome_export_router)');
    expect(page).toContain('/api/civic-genome/export/current?limit=100');
    expect(page).toContain('/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}');
    expect(page).toContain('Export current 100');
    expect(page).toContain('Export bill JSON');
  });
});
