import { renderToStaticMarkup as render_markup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
import { ResourceReviewPresentation } from "./CurrentCorpusConnections";

it("shows reviewed categories, original values and both limited review receipts", () => {
  const html = render_markup(<ResourceReviewPresentation value={{
    recorded_label: "📞 303-297-1815 · denverrescuemission.org",
    recorded_category: "cash_assistance_income",
    reviewed_primary_category: "housing",
    reviewed_category_memberships: ["housing", "food_nutrition"],
    source_transcription_correction: { revision_id: "transcription-source-receipt" },
    category_review: { revision_id: "classification-source-receipt" },
  }} />);
  expect(html).toContain("Reviewed primary category: housing");
  expect(html).toContain("Additional service interpretations: food nutrition");
  expect(html).toContain("303-297-1815");
  expect(html).toContain("cash_assistance_income");
  expect(html).toContain("transcription-source-receipt");
  expect(html).toContain("classification-source-receipt");
  expect(html).toContain("do not verify service suitability or legal applicability");
});

it("does not imply a review exists for an unreviewed source", () => {
  expect(render_markup(<ResourceReviewPresentation value={null} />)).toBe("");
});
