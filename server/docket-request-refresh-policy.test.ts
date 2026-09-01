import { describe, expect, it } from "vitest";
import { docket_request_scoped_refresh_allowed } from "./docket-request-refresh-policy";
import { LEGISCAN_ROLLOUT_STATES } from "./services/legiscan";

describe("Docket request-scoped refresh policy", () => {
  it("fails closed unless the feature and exact jurisdiction are both granted", () => {
    expect(docket_request_scoped_refresh_allowed("WA", {})).toBe(false);
    expect(docket_request_scoped_refresh_allowed("WA", {
      DOCKET_REQUEST_SCOPED_REFRESH_STATES: "WA",
    })).toBe(false);
    expect(docket_request_scoped_refresh_allowed("WA", {
      DOCKET_REQUEST_SCOPED_REFRESH_ENABLED: "true",
    })).toBe(false);
  });

  it("normalizes an explicit comma-separated jurisdiction allowlist", () => {
    const environment = {
      DOCKET_REQUEST_SCOPED_REFRESH_ENABLED: "true",
      DOCKET_REQUEST_SCOPED_REFRESH_STATES: " wa, OR ",
    };

    expect(docket_request_scoped_refresh_allowed("WA", environment)).toBe(true);
    expect(docket_request_scoped_refresh_allowed("or", environment)).toBe(true);
    expect(docket_request_scoped_refresh_allowed("CA", environment)).toBe(false);
  });

  it("does not treat wildcards or invalid jurisdiction tokens as authority", () => {
    const environment = {
      DOCKET_REQUEST_SCOPED_REFRESH_ENABLED: "true",
      DOCKET_REQUEST_SCOPED_REFRESH_STATES: "*, USA, Washington",
    };

    expect(docket_request_scoped_refresh_allowed("WA", environment)).toBe(false);
  });

  it("permits every verified national rollout jurisdiction when each is named", () => {
    const environment = {
      DOCKET_REQUEST_SCOPED_REFRESH_ENABLED: "true",
      DOCKET_REQUEST_SCOPED_REFRESH_STATES: LEGISCAN_ROLLOUT_STATES.join(","),
    };

    for (const state of LEGISCAN_ROLLOUT_STATES) {
      expect(docket_request_scoped_refresh_allowed(state, environment)).toBe(true);
    }
  });
});
