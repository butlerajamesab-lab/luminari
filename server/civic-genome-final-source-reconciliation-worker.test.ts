import { describe, expect, it } from "vitest";
import {
  parse_south_carolina_terminal_act,
  south_carolina_official_terminal_url,
} from "./civic-genome-final-source-reconciliation-worker";

const candidate = {
  genome_bill_id: "00000000-0000-4000-8000-000000000001",
  source_bill_id: 1896217,
  state_code: "SC",
  session_key: "2194",
  source_bill_number: "S0136",
  detail_fetched_at: null,
};

const bill = {
  status_date: "2026-09-02",
  session: {
    session_name: "126th General Assembly",
    year_start: 2025,
    year_end: 2026,
  },
} as any;

describe("official terminal source reconciliation", () => {
  it("derives the canonical South Carolina bill page without inventing a provider document id", () => {
    expect(south_carolina_official_terminal_url(candidate, bill)).toBe(
      "https://www.scstatehouse.gov/sess126_2025-2026/bills/136.htm",
    );
  });

  it("requires an exact matching act, ratification, bill identity and operative act body", () => {
    const html = `
      <html><body>
      <div>A260, R86, S136</div>
      <h1>AN ACT TO AMEND THE SOUTH CAROLINA CODE OF LAWS</h1>
      <p>SECTION 1. Section 17-1-65 is amended to read:</p>
      </body></html>
    `;
    expect(parse_south_carolina_terminal_act(html, "S0136")).toEqual({
      artifact_id: "sc-a260-r86-s136",
      act_number: 260,
      ratification_number: 86,
    });
    expect(parse_south_carolina_terminal_act(html, "S0137")).toBeNull();
    expect(parse_south_carolina_terminal_act("A260, R86, S136", "S0136")).toBeNull();
  });

  it("does not derive a South Carolina terminal source for another jurisdiction", () => {
    expect(south_carolina_official_terminal_url(
      { ...candidate, state_code: "WA" },
      bill,
    )).toBeNull();
  });
});
