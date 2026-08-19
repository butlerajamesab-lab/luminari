import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = readFileSync(join(root, "server", "routes", "civic-genome-export-router.ts"), "utf8");
const humanReport = readFileSync(join(root, "server", "civic-genome-human-report.ts"), "utf8");
const prismPresentation = readFileSync(join(root, "shared", "civic-genome-prism-presentation.ts"), "utf8");
const index = readFileSync(join(root, "server", "_core", "index.ts"), "utf8");
const main = readFileSync(join(root, "client", "src", "main.tsx"), "utf8");
const dock = readFileSync(join(root, "client", "src", "components", "civic-genome", "CivicGenomeExportDock.tsx"), "utf8");
const prismProof = readFileSync(join(root, "client", "src", "components", "civic-genome", "PrismProof.tsx"), "utf8");

describe("Civic Genome export contract", () => {
  it("preserves raw JSON attachments as technical companion data", () => {
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

  it("adds summary and detailed human-readable reports backed by the exact Rosetta source snapshot", () => {
    expect(route).toContain('civic_genome_export_router.get("/bill/:source_bill_id/summary"');
    expect(route).toContain('civic_genome_export_router.get("/bill/:source_bill_id/detailed"');
    expect(route).toContain('text/html; charset=utf-8');
    expect(route).toContain('render_civic_genome_human_report(human_payload, mode)');
    expect(humanReport).toContain('source_document_content');
    expect(humanReport).toContain('source_text');
    expect(humanReport).toContain('Full source text used by Rosetta');
    expect(humanReport).toContain('source_content_hash');
    expect(humanReport).toContain('source_byte_hash');
    expect(humanReport).toContain('source_identity_hash');
    expect(humanReport).toContain('Official legislative source verified');
    expect(humanReport).toContain('does not re-run analysis');
    expect(humanReport).not.toMatch(/delete\s+from/i);
    expect(humanReport).not.toMatch(/update\s+public\./i);
    expect(humanReport).not.toMatch(/insert\s+into\s+public\./i);
  });

  it("classifies human Prism results without inventing a final-bill comparison", () => {
    expect(prismPresentation).toContain('label: "Technical verification finding"');
    expect(prismPresentation).toContain('label: "Amendment not adopted"');
    expect(prismPresentation).toContain('label: "Amendment disposition conflict"');
    expect(route).toContain('humanize_report_headings');
    expect(route).toContain('Prism verification findings');
    expect(route).toContain('civic_genome_prism_display');
    expect(prismProof).toContain('Prism verification findings');
    expect(prismProof).toContain('civic_genome_prism_display');
    expect(prismProof).not.toContain('language did not carry into final bill');
  });

  it("does not present absence of a second source as a legislative verification gap", () => {
    expect(prismProof).toContain('Official legislative source verified; binding continuity verified');
    expect(prismProof).toContain('.filter(entry => proof_title(entry) !== "independent_authoritative_source_not_supplied")');
    expect(prismPresentation).toContain('NO_SECOND_SOURCE_CONDITION');
    expect(prismPresentation).toContain('civic_genome_meaningful_unresolved');
    expect(route).toContain('civic_genome_meaningful_unresolved');
  });

  it("normalizes report dates through the same JSON boundary as the technical export", () => {
    expect(route).toContain('JSON.parse(JSON.stringify(payload))');
    expect(route).toContain('event.event_at = event.event_timestamp');
  });

  it("bounds the multi-bill proof export and exposes direct source bill IDs", () => {
    expect(route).toContain('const MULTI_EXPORT_LIMIT = 100;');
    expect(route).toContain('source_bill_id: source_bill_id_from_bill(bill)');
    expect(route).toContain('returned_bill_count: export_bills.length');
    expect(route).toContain('total_bill_count: stats.total_bills');
    expect(route).toContain('max_limit: MULTI_EXPORT_LIMIT');
  });

  it("mounts the export route and makes human reports primary on bill pages", () => {
    expect(index).toContain('civic_genome_export_router');
    expect(index).toContain('app.use("/api/civic-genome/export", civic_genome_export_router)');
    expect(main).toContain('CivicGenomeExportDock');
    expect(dock).toContain('/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}/summary');
    expect(dock).toContain('/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}/detailed');
    expect(dock).toContain('/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}');
    expect(dock).toContain('Summary report');
    expect(dock).toContain('Detailed report');
    expect(dock).toContain('Technical JSON');
    expect(dock).toContain('Technical data · current 100');
  });
});
