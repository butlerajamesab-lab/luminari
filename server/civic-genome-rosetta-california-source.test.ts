import { describe, expect, it } from "vitest";

import { derive_california_official_text_url } from "./civic-genome-rosetta-extraction";

describe("California official legislative text URL", () => {
  it("maps the exact AB635 JSF wrapper to the official server-rendered bill route", () => {
    expect(derive_california_official_text_url(
      "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB635#97AMD",
    )).toBe(
      "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB635",
    );
  });

  it("does not rewrite other jurisdictions or incomplete California identities", () => {
    expect(derive_california_official_text_url(
      "https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bills/Session%20Laws/House/1701-S2.SL.htm",
    )).toBeNull();
    expect(derive_california_official_text_url(
      "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml",
    )).toBeNull();
  });
});
