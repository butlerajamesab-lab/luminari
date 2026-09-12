import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ result: {} as any, page: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { canonicalCore: {
  legalAuthorities: { useQuery: state.page },
  legal_authority: { useQuery: vi.fn() },
} } }));
import { Source_authority_catalog } from "./source-authority-catalog";

beforeEach(() => {
  state.result = { data: { inventory_total: 1939, total: 1762, held_total: 177,
    jurisdiction_conflict_total: 121, jurisdiction_unresolved_total: 56,
    items: [{ object_ref: "source-ref-1", name: "25 U.S.C. § 1301", state_code: "IA",
      artifact_key: "Iowa resource directory.docx", source_locator: "lines:781-809:statutory_authority" }] },
    isLoading: false, isFetching: false };
  state.page.mockReset().mockImplementation(() => state.result);
});

it("shows source references and provenance with separate ready and held inventory", () => {
  const html = renderToStaticMarkup(<Source_authority_catalog query="25 U.S.C." jurisdiction="IA" />);
  expect(state.page).toHaveBeenCalledWith({ query: "25 U.S.C.", jurisdiction: "IA", limit: 50, offset: 0 });
  expect(html).toContain("1,939 matching source references");
  expect(html).toContain("1,762 ready to view");
  expect(html).toContain("177 held from publication");
  expect(html).toContain("25 U.S.C. § 1301");
  expect(html).toContain("Iowa resource directory.docx");
  expect(html).toContain("lines:781-809:statutory_authority");
  expect(html).toContain("Read source detail");
  expect(html).not.toContain("Attach to Case");
  expect(html).not.toContain("Statutory Text");
});

it("reports unavailable data without inventing zero counts", () => {
  state.result = { error: new Error("Connection failed"), isLoading: false };
  const html = renderToStaticMarkup(<Source_authority_catalog />);
  expect(html).toContain("Connection failed");
  expect(html).not.toContain("0 matching source references");
  expect(html).not.toContain("No ready source references");
});

it("retains the last result during a transient refresh failure", () => {
  state.result.error = new Error("Connection failed");
  const html = renderToStaticMarkup(<Source_authority_catalog />);
  expect(html).toContain("Showing the last successful result");
  expect(html).toContain("25 U.S.C. § 1301");
});

it.each(["UNAUTHORIZED", "FORBIDDEN"])("withholds cached references after %s", code => {
  state.result.error = { message: "Access denied", data: { code } };
  const html = renderToStaticMarkup(<Source_authority_catalog />);
  expect(html).toContain("Access denied");
  expect(html).not.toContain("25 U.S.C. § 1301");
});
