/**
 * Address -> districts for the legislators hub ("Who represents me").
 *
 * Most visitors do not know their district numbers, so the hub accepts
 * the one locator they do know — their street address — and resolves
 * its districts through the U.S. Census Bureau Geocoder
 * (geographies/onelineaddress, benchmark Public_AR_Current, vintage
 * Current_Current; both names read from the service's own registry on
 * 2026-11-04). This is a declared transformation of a source address,
 * not a lookup of the person: the address itself is never stored, and
 * the only values returned are district strings in exactly the formats
 * public.legislators carries (federal "7" / at-large "0"; state
 * districts in the Census BASENAME form the base was seeded with,
 * e.g. "34", "10A").
 *
 * Honest outcomes only: a matched address returns its districts; an
 * address the geocoder cannot match returns no_match; a geocoder
 * failure returns unavailable. Nothing is inferred, interpolated, or
 * filled in — a district the Census did not return stays null here,
 * and the router additionally drops any returned district that has no
 * roster behind it in the base before the page may select it.
 *
 * The Find-an-Office locator (F3) resolves the same address to its
 * coordinates through this same module: one Census Geocoder, one
 * benchmark/vintage pin, one fetch path — parseCensusCoordinates and
 * lookupAddressPoint below read the coordinates the geographies
 * response already carries on every match. There is no second
 * geocoder.
 */

export interface GeocodeMatch {
  matchedAddress: string;
  /** USPS state code derived from the Census state GEOID (FIPS). */
  state: string;
  /** Congressional district as the base stores it ("7"; "0" = at-large). */
  federalDistrict: string | null;
  /** State legislative district, upper chamber layer (BASENAME form). */
  upperDistrict: string | null;
  /** State legislative district, lower chamber layer (BASENAME form). */
  lowerDistrict: string | null;
}

export type GeocodeOutcome =
  | { status: "matched"; match: GeocodeMatch }
  | { status: "no_match" }
  | { status: "unavailable" };

export interface GeocodePointMatch {
  matchedAddress: string;
  /** Latitude in decimal degrees, exactly as the Census returned it. */
  latitude: number;
  /** Longitude in decimal degrees, exactly as the Census returned it. */
  longitude: number;
}

export type GeocodePointOutcome =
  | { status: "matched"; match: GeocodePointMatch }
  | { status: "no_match" }
  | { status: "unavailable" };

/** Census state GEOID (FIPS) -> USPS code, for every jurisdiction the hub covers. */
const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR",
  "78": "VI",
};

interface CensusGeography {
  BASENAME?: string;
  GEOID?: string;
}

type CensusGeographies = Record<string, CensusGeography[]>;

/**
 * Find a geography layer by its stable suffix. Census layer names carry
 * the Congress and the SLD year ("120th Congressional Districts",
 * "2026 State Legislative Districts - Upper") and change as vintages
 * roll; the suffixes are the stable part.
 */
function layerBySuffix(
  geographies: CensusGeographies,
  suffix: string,
): CensusGeography | null {
  for (const [name, entries] of Object.entries(geographies)) {
    if (name.endsWith(suffix) && entries.length > 0) {
      return entries[0];
    }
  }
  return null;
}

/**
 * Parse a Census Geocoder geographies payload into hub district
 * strings. Pure: returns null when the payload holds no usable match.
 *
 * The federal district is derived from the district GEOID, not
 * BASENAME: for at-large states the Census BASENAME is the text
 * "Congressional District (at Large)", while the GEOID's district
 * digits are "00" — which the base stores as "0".
 */
export function parseCensusGeographies(payload: unknown): GeocodeMatch | null {
  const root = payload as {
    result?: { addressMatches?: unknown };
  } | null;
  const matches = root?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }
  const first = matches[0] as {
    matchedAddress?: string;
    geographies?: CensusGeographies;
  };
  const geographies = first?.geographies;
  if (!geographies || typeof geographies !== "object") {
    return null;
  }

  const stateGeoid = geographies["States"]?.[0]?.GEOID;
  const state = stateGeoid ? FIPS_TO_STATE[stateGeoid] : undefined;
  if (!state) {
    return null;
  }

  let federalDistrict: string | null = null;
  const congressional = layerBySuffix(geographies, "Congressional Districts");
  const cdGeoid = congressional?.GEOID;
  if (cdGeoid && /^[0-9]{4}$/.test(cdGeoid)) {
    const digits = cdGeoid.slice(2);
    federalDistrict = digits === "00" ? "0" : String(parseInt(digits, 10));
  }

  const upper = layerBySuffix(
    geographies,
    "State Legislative Districts - Upper",
  )?.BASENAME?.trim();
  const lower = layerBySuffix(
    geographies,
    "State Legislative Districts - Lower",
  )?.BASENAME?.trim();

  return {
    matchedAddress: first.matchedAddress ?? "",
    state,
    federalDistrict,
    upperDistrict: upper ? upper : null,
    lowerDistrict: lower ? lower : null,
  };
}

/**
 * Parse a Census Geocoder geographies payload into the matched
 * address's coordinates. Pure: returns null when the payload holds no
 * usable match. The geographies response carries the coordinates on
 * every address match ({ x: longitude, y: latitude }); only finite,
 * in-range values are accepted — anything else is no match at all,
 * never a guessed point.
 */
export function parseCensusCoordinates(
  payload: unknown,
): GeocodePointMatch | null {
  const root = payload as {
    result?: { addressMatches?: unknown };
  } | null;
  const matches = root?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }
  const first = matches[0] as {
    matchedAddress?: string;
    coordinates?: { x?: unknown; y?: unknown };
  };
  const x = Number(first?.coordinates?.x);
  const y = Number(first?.coordinates?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (x < -180 || x > 180 || y < -90 || y > 90) {
    return null;
  }
  return {
    matchedAddress: first.matchedAddress ?? "",
    latitude: y,
    longitude: x,
  };
}

const GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

/**
 * The one Census Geocoder call both lookups share: same endpoint,
 * same pinned benchmark and vintage, same timeout. The address is
 * sent to the Census Bureau for this single lookup and is never
 * stored or logged here. Returns the parsed payload, or null when
 * the service failed (non-200, network error, bad JSON) — callers
 * report that as unavailable rather than guessing.
 */
async function fetchCensusGeocoderPayload(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url.toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve one street address to its districts via the Census Geocoder.
 * The address is sent to the Census Bureau for this single lookup and
 * is never stored or logged here.
 */
export async function lookupAddressDistricts(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeOutcome> {
  const payload = await fetchCensusGeocoderPayload(address, fetchImpl);
  if (payload === null) {
    return { status: "unavailable" };
  }
  const match = parseCensusGeographies(payload);
  return match ? { status: "matched", match } : { status: "no_match" };
}

/**
 * Resolve one street address to its coordinates via the same Census
 * Geocoder call the legislators hub makes (see
 * fetchCensusGeocoderPayload). Honest shapes only: matched with the
 * Census-returned point, no_match, or unavailable — a locator must
 * never fall back to a guessed point.
 */
export async function lookupAddressPoint(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodePointOutcome> {
  const payload = await fetchCensusGeocoderPayload(address, fetchImpl);
  if (payload === null) {
    return { status: "unavailable" };
  }
  const match = parseCensusCoordinates(payload);
  return match ? { status: "matched", match } : { status: "no_match" };
}
