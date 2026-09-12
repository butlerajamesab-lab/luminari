import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./services/current-legal-authority-reader", () => ({ read_current_legal_authority: vi.fn() }));
import { legal_commit_ref, parse_legal_commit_ref, resolve_legal_reference } from "./legal-reference-runtime";

beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    // Same-number IDs deliberately exist in unrelated source collections.
    if (sql.includes("from public.settlement_formulas")) return { rows: [{ record: { formula_id: "7", formula_name: "Formula seven", formula_expression: "stored expression" } }] };
    if (sql.includes("from public.v_runtime_enforcement")) return { rows: [{ id: "7", agency_name: "Agency seven", source_url: "https://example.gov/enforcement/7" }] };
    if (sql.includes("from public.legal_case_law l")) return { rows: [{ id: "7", runtime_entity_id: "7", case_name: "Case seven", metadata: { runtime_source: "legacy_compat" } }] };
    if (sql.includes("from public.legal_statutes l")) return { rows: [{ id: "7", runtime_entity_id: "7", short_title: "Statute seven", metadata: { runtime_source: "legacy_compat" } }] };
    throw new Error("Unexpected source query");
  });
});

describe("source-kind attachment isolation", () => {
  it.each([
    ["statute", "short_title", "Statute seven"],
    ["case_law", "case_name", "Case seven"],
    ["enforcement", "agency_name", "Agency seven"],
    ["settlement_formula", "formula_name", "Formula seven"],
  ] as const)("resolves %s from its own source when IDs collide", async (kind, key, name) => {
    const ref = legal_commit_ref(kind, "7");
    expect(parse_legal_commit_ref(ref)).toEqual({ kind, id: "7" });
    const resolved = await resolve_legal_reference(ref);
    expect(resolved).toMatchObject({ committed_ref: ref, kind, status: "resolved", record: { [key]: name } });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(params[0]).toBe("7");
    if (kind !== "statute") expect(sql).not.toContain("from public.legal_statutes l");
    if (kind === "enforcement") expect(sql).toContain("id::text = $1");
    if (kind === "settlement_formula") expect(sql).toContain("formula.formula_id::text = $1");
  });

  it.each(["enforcement:", "settlement_formula:"])("rejects empty %s without browsing", async ref => {
    await expect(resolve_legal_reference(ref)).resolves.toMatchObject({ status: "unresolved", record: null });
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps an unavailable formula unresolved instead of trying a same-ID statute", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(resolve_legal_reference("settlement_formula:7")).resolves.toMatchObject({ status: "unresolved", committed_ref: "settlement_formula:7" });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

function commit_calls(path: string) {
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: Array<{ kind: string; id: string; label: string; start: number }> = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === "CommitToCase") {
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(file), attr.initializer]));
      const literal = (name: string) => { const attr = attrs.get(name); return attr && ts.isStringLiteral(attr) ? attr.text : ""; };
      const id = attrs.get("itemId");
      calls.push({ kind: literal("type"), label: literal("label"), id: id && ts.isJsxExpression(id) ? id.expression?.getText(file) ?? "" : "", start: node.getStart(file) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { source, calls };
}

it("keeps the three previously misrouted UI actions in their source namespaces", () => {
  const legal = commit_calls("client/src/pages/LegalLibrary.tsx");
  expect(legal.calls.find(call => call.id === "record.id")).toMatchObject({ kind: "enforcement" });
  const mission = commit_calls("client/src/pages/MissionControl.tsx");
  const case_start = mission.source.indexOf('{/* Case Law */}');
  const case_end = mission.source.indexOf('{/* Agencies */}', case_start);
  expect(mission.calls.filter(call => call.start > case_start && call.start < case_end)).toEqual([
    expect.objectContaining({ kind: "case_law", id: "r.id" }),
  ]);
  expect(mission.calls.find(call => call.label === "Attach Formula Reference")).toMatchObject({ kind: "settlement_formula", id: "r.id" });
  expect(mission.calls.some(call => call.label === "Apply Formula to Case")).toBe(false);
});
