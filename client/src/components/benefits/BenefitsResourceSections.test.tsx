import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
import { Benefits_resource_cards } from "./BenefitsResourceSections";

describe("resource cards and source uncertainty", () => {
  it("does not turn a query error into proven counts or mapped offices", () => {
    const html = renderToStaticMarkup(<Benefits_resource_cards kind="benefits_office" result={{ isLoading: false, error: new Error("timeout"), refetch() {} }} />);
    expect(html).toContain("Resource records are temporarily unavailable.");
    expect(html).toContain("Retry resource records");
    expect(html).not.toContain("62");
    expect(html).not.toContain("53 rooftop");
    expect(html).not.toContain("0 records have coordinates");
  });

  it("renders returned card identity, contact and source version without a verified badge", () => {
    const html = renderToStaticMarkup(<Benefits_resource_cards kind="food_bank" result={{ isLoading: false, error: null, refetch() {}, data: {
      ok: true, total: 1, mapped: 0, precision_breakdown: { rooftop: 0, street: 0, other: 0 }, has_more: false, warning: null,
      rows: [{ id: "food-1", name: "Community Food", phone: "206-555-0100", source_snapshot_hash: "abc123", website_url: "javascript:alert(1)" }],
    } }} />);
    expect(html).toContain("Showing 1 of 1 source records.");
    expect(html).toContain("Community Food");
    expect(html).toContain('href="tel:2065550100"');
    expect(html).toContain("abc123");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">Verified<");
  });
});
