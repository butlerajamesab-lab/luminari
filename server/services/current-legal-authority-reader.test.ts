import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db-legacy", () => ({ query_with_diagnostics: query }));
import { build_legal_authority_page_query, read_current_legal_authorities, read_current_legal_authority } from "./current-legal-authority-reader";

beforeEach(() => { query.mockReset(); });

describe("current source authority reader", () => {
  it("preserves full inventory beyond the final page without publishing held records", async () => {
    query.mockResolvedValue({ rows: [{ inventory_total: 1939, filtered_total: 1762, held_total: 177,
      jurisdiction_conflict_total: 121, jurisdiction_unresolved_total: 56, items: [] }] });
    const result = await read_current_legal_authorities({ offset: 1800, limit: 50 });
    expect(result).toMatchObject({ inventory_total: 1939, total: 1762, held_total: 177, offset: 1800, items: [] });
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("select * from filtered where legal_catalog_ready is true");
    expect(sql).toContain("from visible_page p");
    expect(sql).not.toContain("jsonb_agg(to_jsonb(filtered)");
  });

  it("binds search text and jurisdiction without treating source locators as statute identities", () => {
    const input = { query: "25 U.S.C. %'; select", jurisdiction: "ia", limit: 20, offset: 40 };
    const built = build_legal_authority_page_query(input);
    expect(built.params).toEqual(["%25 U.S.C. %'; select%", "IA", 20, 40]);
    expect(built.sql).not.toContain(input.query);
    expect(built.sql).toContain("upper(coalesce(nullif(state_code,''),jurisdiction))=$2");
    expect(built.sql).not.toContain("xlsx:");
  });

  it("resolves source detail by exact object ref and retains the original provenance", async () => {
    const reference = { object_ref: "a".repeat(64), artifact_key: "state.docx", source_candidate_hash: "b".repeat(64),
      source_locator: "lines:21-47:statutory_authority", state_code: "IA", source_authority_text: "25 U.S.C. § 1301" };
    query.mockResolvedValue({ rows: [reference] });
    expect(await read_current_legal_authority(reference.object_ref)).toBe(reference);
    expect(query.mock.calls[0][1]).toEqual([reference.object_ref]);
    expect(query.mock.calls[0][0]).toContain("where object_ref=$1 and object_class='legal_authority' and legal_catalog_ready is true");
    expect(query.mock.calls[0][0]).toContain("p.candidate_hash=c.source_candidate_hash and p.artifact_key=c.artifact_key");
  });

  it("returns no detail for held, removed, or unknown references", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await read_current_legal_authority("unknown")).toBeNull();
  });

  it("refuses ambiguous reference IDs and propagates outages instead of returning an empty catalog", async () => {
    query.mockResolvedValueOnce({ rows: [{ object_ref: "duplicate" }, { object_ref: "duplicate" }] });
    await expect(read_current_legal_authority("duplicate")).rejects.toThrow("ambiguous");
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(read_current_legal_authorities()).rejects.toThrow("database unavailable");
  });
});
