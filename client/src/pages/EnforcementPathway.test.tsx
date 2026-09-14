import { readFileSync } from "node:fs";
import { renderToStaticMarkup as render_markup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn(), search: "" }));
vi.mock("@/lib/trpc", () => ({ trpc: { enforcementIntel: { get_enforcement_pathway: { useQuery: state.query } } } }));
vi.mock("wouter", () => ({ useSearch: () => state.search, useLocation: () => ["/enforcement-pathway", vi.fn()] }));
vi.mock("@/components/CaseActionPaths", () => ({ CaseActionPaths: () => null }));
vi.mock("../../../server/db", () => ({ getPool: () => ({ query: vi.fn() }) }));

import EnforcementPathway from "./EnforcementPathway";
import { build_enforcement_pathway_dto } from "../../../server/enforcement-pathway-runtime-compat";

beforeEach(() => { state.query.mockReset(); state.search = ""; });

it("renders the Colorado model reached by its stable link and discloses missing steps", () => {
  const model_references = JSON.parse(readFileSync(new URL("../../../server/fixtures/enforcement-pathway-reviewed-parents.json", import.meta.url), "utf8"));
  state.search = "?pathway_id=state_wage_co&jurisdiction=CO";
  const data = build_enforcement_pathway_dto({ pathway_id: "state_wage_co", jurisdiction: "CO" }, {
    pathways: [], agency_forms: [], model_references,
  });
  state.query.mockReturnValue({ data, isLoading: false, isError: false });
  const html = render_markup(<EnforcementPathway />);
  expect(state.query).toHaveBeenCalledWith({ pathway_id: "state_wage_co", jurisdiction: "CO" });
  expect(html).toContain("Colorado Department of Labor and Employment");
  expect(html).toContain("state_wage_co");
  expect(html).toContain("This source model has no recorded steps");
  expect(html).toContain("legal assertions remain unverified");
  expect(html).not.toContain("72%");
  expect(html).not.toContain("35%");
});

it("renders ordered source steps without making the case-reference action available", () => {
  const model_references = JSON.parse(readFileSync(new URL("../../../server/fixtures/enforcement-pathway-reviewed-parents.json", import.meta.url), "utf8"));
  const data = build_enforcement_pathway_dto({ pathway_id: "fed_dol_001" }, {
    pathways: [], agency_forms: [], model_references,
  });
  state.query.mockReturnValue({ data, isLoading: false, isError: false });
  const html = render_markup(<EnforcementPathway />);
  const steps_html = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
  expect(steps_html.indexOf("Complaint Filing")).toBeLessThan(steps_html.indexOf("Investigation"));
  expect(html).toContain("These statements have not been verified for your situation");
  expect(html).toContain("Current object linkage not established");
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Add Reference<\/button>/);
});
