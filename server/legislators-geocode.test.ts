import { describe, expect, it } from "vitest";
import {
  lookupAddressDistricts,
  lookupAddressPoint,
  parseCensusCoordinates,
  parseCensusGeographies,
} from "./legislators-geocode";

/**
 * Fixtures are shaped from live Census Geocoder responses captured
 * 2026-11-04 (benchmark Public_AR_Current, vintage Current_Current):
 * 600 4th Ave, Seattle, WA 98104 and 200 W 24th St, Cheyenne, WY 82002.
 * Only the fields the parser reads are kept.
 */
const seattlePayload = {
  result: {
    addressMatches: [
      {
        matchedAddress: "600 4TH AVE, SEATTLE, WA, 98104",
        geographies: {
          States: [{ BASENAME: "Washington", GEOID: "53" }],
          "120th Congressional Districts": [
            { BASENAME: "7", GEOID: "5307" },
          ],
          "2026 State Legislative Districts - Upper": [
            { BASENAME: "34", GEOID: "53034" },
          ],
          "2026 State Legislative Districts - Lower": [
            { BASENAME: "34", GEOID: "53034" },
          ],
        },
      },
    ],
  },
};

const cheyennePayload = {
  result: {
    addressMatches: [
      {
        matchedAddress: "200 W 24TH ST, CHEYENNE, WY, 82001",
        geographies: {
          States: [{ BASENAME: "Wyoming", GEOID: "56" }],
          "120th Congressional Districts": [
            { BASENAME: "Congressional District (at Large)", GEOID: "5600" },
          ],
          "2026 State Legislative Districts - Upper": [
            { BASENAME: "8", GEOID: "56008" },
          ],
          "2026 State Legislative Districts - Lower": [
            { BASENAME: "11", GEOID: "56011" },
          ],
        },
      },
    ],
  },
};

describe("parseCensusGeographies", () => {
  it("resolves a matched address to the district strings the base stores", () => {
    expect(parseCensusGeographies(seattlePayload)).toEqual({
      matchedAddress: "600 4TH AVE, SEATTLE, WA, 98104",
      state: "WA",
      federalDistrict: "7",
      upperDistrict: "34",
      lowerDistrict: "34",
    });
  });

  it("derives the at-large federal district from the GEOID, not the text BASENAME", () => {
    const match = parseCensusGeographies(cheyennePayload);
    expect(match?.state).toBe("WY");
    expect(match?.federalDistrict).toBe("0");
    expect(match?.upperDistrict).toBe("8");
    expect(match?.lowerDistrict).toBe("11");
  });

  it("returns null for a payload with no address matches", () => {
    expect(
      parseCensusGeographies({ result: { addressMatches: [] } }),
    ).toBeNull();
  });

  it("returns null for malformed payloads instead of guessing", () => {
    expect(parseCensusGeographies(null)).toBeNull();
    expect(parseCensusGeographies({})).toBeNull();
    expect(parseCensusGeographies({ result: {} })).toBeNull();
    expect(
      parseCensusGeographies({
        result: { addressMatches: [{ matchedAddress: "X" }] },
      }),
    ).toBeNull();
  });
});

function fakeFetch(payload: unknown, ok = true, status = 200) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    return { ok, status, json: async () => payload } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("lookupAddressDistricts", () => {
  it("calls the Census geographies endpoint with the pinned benchmark and vintage", async () => {
    const { impl, calls } = fakeFetch(seattlePayload);
    const outcome = await lookupAddressDistricts(
      "600 4th Ave, Seattle, WA 98104",
      impl,
    );
    expect(outcome.status).toBe("matched");
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/geocoder/geographies/onelineaddress");
    expect(url.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(url.searchParams.get("vintage")).toBe("Current_Current");
    expect(url.searchParams.get("address")).toBe(
      "600 4th Ave, Seattle, WA 98104",
    );
  });

  it("reports no_match when the geocoder matches nothing", async () => {
    const { impl } = fakeFetch({ result: { addressMatches: [] } });
    expect(
      await lookupAddressDistricts("1 Nowhere Lane, Zzz, ZZ 00000", impl),
    ).toEqual({ status: "no_match" });
  });

  it("reports unavailable on a non-200 response", async () => {
    const { impl } = fakeFetch({}, false, 500);
    expect(await lookupAddressDistricts("600 4th Ave, Seattle, WA", impl)).toEqual({
      status: "unavailable",
    });
  });

  it("reports unavailable when the fetch itself fails", async () => {
    const impl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await lookupAddressDistricts("600 4th Ave, Seattle, WA", impl)).toEqual({
      status: "unavailable",
    });
  });
});

/**
 * Coordinates fixtures: the geographies response carries the matched
 * point on every address match as coordinates { x: longitude,
 * y: latitude }. Values below are the Census-returned point shape for
 * the same Seattle address as the district fixtures.
 */
const seattlePointPayload = {
  result: {
    addressMatches: [
      {
        matchedAddress: "600 4TH AVE, SEATTLE, WA, 98104",
        coordinates: { x: -122.330062, y: 47.606453 },
        geographies: seattlePayload.result.addressMatches[0].geographies,
      },
    ],
  },
};

describe("parseCensusCoordinates", () => {
  it("reads the matched point as latitude and longitude", () => {
    expect(parseCensusCoordinates(seattlePointPayload)).toEqual({
      matchedAddress: "600 4TH AVE, SEATTLE, WA, 98104",
      latitude: 47.606453,
      longitude: -122.330062,
    });
  });

  it("returns null when the payload holds no address matches", () => {
    expect(
      parseCensusCoordinates({ result: { addressMatches: [] } }),
    ).toBeNull();
  });

  it("returns null when the match carries no usable coordinates", () => {
    expect(
      parseCensusCoordinates({
        result: { addressMatches: [{ matchedAddress: "X" }] },
      }),
    ).toBeNull();
    expect(
      parseCensusCoordinates({
        result: {
          addressMatches: [
            { matchedAddress: "X", coordinates: { x: "east", y: null } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("returns null for out-of-range coordinates instead of a wrong point", () => {
    expect(
      parseCensusCoordinates({
        result: {
          addressMatches: [
            { matchedAddress: "X", coordinates: { x: -190.5, y: 47.6 } },
          ],
        },
      }),
    ).toBeNull();
    expect(
      parseCensusCoordinates({
        result: {
          addressMatches: [
            { matchedAddress: "X", coordinates: { x: -122.3, y: 95.1 } },
          ],
        },
      }),
    ).toBeNull();
  });

  it("returns null for malformed payloads instead of guessing", () => {
    expect(parseCensusCoordinates(null)).toBeNull();
    expect(parseCensusCoordinates({})).toBeNull();
    expect(parseCensusCoordinates({ result: {} })).toBeNull();
  });
});

describe("lookupAddressPoint", () => {
  it("resolves a matched address to its Census point via the same endpoint", async () => {
    const { impl, calls } = fakeFetch(seattlePointPayload);
    const outcome = await lookupAddressPoint(
      "600 4th Ave, Seattle, WA 98104",
      impl,
    );
    expect(outcome).toEqual({
      status: "matched",
      match: {
        matchedAddress: "600 4TH AVE, SEATTLE, WA, 98104",
        latitude: 47.606453,
        longitude: -122.330062,
      },
    });
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/geocoder/geographies/onelineaddress");
    expect(url.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(url.searchParams.get("vintage")).toBe("Current_Current");
  });

  it("reports no_match when the geocoder matches nothing", async () => {
    const { impl } = fakeFetch({ result: { addressMatches: [] } });
    expect(
      await lookupAddressPoint("1 Nowhere Lane, Zzz, ZZ 00000", impl),
    ).toEqual({ status: "no_match" });
  });

  it("reports no_match when a match carries no coordinates — never a guessed point", async () => {
    const { impl } = fakeFetch(seattlePayload);
    expect(
      await lookupAddressPoint("600 4th Ave, Seattle, WA 98104", impl),
    ).toEqual({ status: "no_match" });
  });

  it("reports unavailable on a non-200 response", async () => {
    const { impl } = fakeFetch({}, false, 500);
    expect(await lookupAddressPoint("600 4th Ave, Seattle, WA", impl)).toEqual({
      status: "unavailable",
    });
  });

  it("reports unavailable when the fetch itself fails", async () => {
    const impl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await lookupAddressPoint("600 4th Ave, Seattle, WA", impl)).toEqual({
      status: "unavailable",
    });
  });
});
