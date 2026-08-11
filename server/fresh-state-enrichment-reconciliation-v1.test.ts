import { describe, expect, it } from "vitest";
import { parseStateEnrichmentText } from "./services/fresh-state-enrichment-reconciliation-v1";

describe("fresh state enrichment reconciliation", () => {
  it("extracts label-value resource blocks without turning field values into resource names", () => {
    const text = `
LAYER 1 — HELP: Programs & Resources
FOOD & NUTRITION
Arizona Nutrition Assistance (SNAP) — Health-e-Arizona Plus
Address: DES/FAA offices statewide · Apply online: healthearizonaplus.gov
Phone: 855-432-7587
Website: healthearizonaplus.gov
Eligibility: Income < 130% FPL.
Apply / Notes: One application covers SNAP, AHCCCS, TANF, LIHEAP.

St. Mary's Food Bank Alliance (Phoenix — World's First Food Bank)
Address: 2831 N 31st Ave, Phoenix, AZ 85009
Phone: 602-242-3663
Website: firstfoodbank.org
Eligibility: Anyone in need.
Apply / Notes: Find nearest distribution.

AHCCCS KEY ADVANTAGE: Arizona Medicaid has no asset limits for most categories.
AHCCCS (Arizona Medicaid — Expanded)
Address: DES/FAA offices statewide
Phone: 855-432-7587
Website: azahcccs.gov
Eligibility: Income < 138% FPL.
Apply / Notes: Apply online.
`;
    const rows = parseStateEnrichmentText(text);
    expect(rows.map(row => row.name)).toEqual([
      "Arizona Nutrition Assistance (SNAP) — Health-e-Arizona Plus",
      "St. Mary's Food Bank Alliance (Phoenix — World's First Food Bank)",
      "AHCCCS (Arizona Medicaid — Expanded)",
    ]);
    expect(rows.some(row => row.name.startsWith("2831 N 31st Ave"))).toBe(false);
    expect(rows.some(row => row.name.startsWith("855-432"))).toBe(false);
    expect(rows.some(row => row.name.startsWith("healthearizona"))).toBe(false);
    expect(rows[0]?.phone).toBe("855-432-7587");
    expect(rows[1]?.category).toBe("food_nutrition");
  });
});
