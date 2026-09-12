import { beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db-legacy", () => ({ query_with_diagnostics: query }));
vi.mock("./services/current-legal-authority-reader", () => ({ read_current_legal_authorities: async () => { const result = await query("current_corpus_legal_authorities"); return { total: result.rows[0].current_corpus_legal_authorities }; } }));
import { build_integration_diagnostic_ledger } from "./integration-diagnostic-ledger";

function database_result(sql: string) {
  if (sql.includes("current_corpus_legal_authorities")) return { rows: [{ current_corpus_legal_authorities: 9 }] };
  if (sql.includes("as populated")) return { rows: [{ populated: 9, catalog_ready: 3, stranded: 6 }] };
  return { rows: [{ count: 4 }] };
}

describe("integration diagnostic ledger availability", () => {
  beforeEach(() => { query.mockReset(); });
  it("separates measured runtime counts from publication readiness and route declarations", async () => {
    query.mockImplementation(async (sql: string) => database_result(sql));
    const result = await build_integration_diagnostic_ledger();
    expect(result.stranded_unpublished_records.legal_authorities).toMatchObject({ populated: 9, catalog_ready: 3, stranded: 6, visible: 9 });
    expect(result.stranded_unpublished_records.resources).toMatchObject({ populated: 9, catalog_ready: 3, visible: null });
    expect(result.known_surface_mismatches).toEqual([]);
    expect(result.runtime_projection_coverage.every(row => row.measurement_state === "not_measured")).toBe(true);
  });
  it("preserves one projection failure without erasing successful surfaces", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("as populated") && sql.includes("resource_program")) throw Object.assign(new Error("resource query timed out"), { code: "57014" });
      return database_result(sql);
    });
    const result = await build_integration_diagnostic_ledger();
    expect(result.stranded_unpublished_records.resources).toMatchObject({ populated: null, catalog_ready: null, stranded: null, visible: null,
      availability: { status: "error", error: { code: "57014", message: "resource query timed out" } } });
    expect(result.stranded_unpublished_records.legal_authorities.populated).toBe(9);
    expect(result.stranded_unpublished_records.workflows.populated).toBe(9);
  });
  it("distinguishes successful empty reads from missing relations and failed runtime measurements", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("signal_artifact_case_links")) throw Object.assign(new Error("relation unavailable"), { code: "42P01" });
      if (sql.includes("current_corpus_legal_authorities")) throw new Error("runtime measurement failed");
      if (sql.includes("as populated")) return { rows: [{ populated: 0, catalog_ready: 0, stranded: 0 }] };
      return { rows: [{ count: 0 }] };
    });
    const result = await build_integration_diagnostic_ledger();
    expect(result.stranded_unpublished_records.resources.availability.status).toBe("empty");
    expect(result.stranded_unpublished_records.case_resource_links).toBe(0);
    expect(result.stranded_unpublished_records.signal_case_links).toBeNull();
    expect(result.link_availability?.signal_case_links.status).toBe("unavailable");
    expect(result.legal_runtime_measurement).toMatchObject({ count: null, availability: { status: "error" } });
    expect(result.known_surface_mismatches).toEqual([]);
  });
  it("reports a mismatch only after a successful zero runtime measurement", async () => {
    query.mockImplementation(async (sql: string) => sql.includes("current_corpus_legal_authorities")
      ? { rows: [{ current_corpus_legal_authorities: 0 }] } : database_result(sql));
    const result = await build_integration_diagnostic_ledger();
    expect(result.known_surface_mismatches).toEqual([expect.objectContaining({ surface: "/legal-library", populated_substrate: 9, visible_projection: 0 })]);
  });
  it("does not turn failed relation counts into a complete family total", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)::int as count from public.legal_statutes")) throw new Error("cannot count");
      return database_result(sql);
    });
    const result = await build_integration_diagnostic_ledger();
    expect(result.source_family_coverage.find(row => row.family_key === "legal")).toMatchObject({ relation_row_total: null, populated_relations: null, measurement_complete: false });
  });
});
