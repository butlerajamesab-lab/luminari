/**
 * Geocoding Service — address → lat/lng with persistent cache
 *
 * T1. Normalize input address to a canonical key (lowercase, trimmed, collapsed whitespace).
 * T2. Check geocode_cache table for existing entry by addressKey.
 * T3. If cache hit → return cached { lat, lng, formattedAddress, placeId }.
 * T4. If cache miss → call Google Maps Geocoding API via server proxy.
 * T5. Store result in geocode_cache for future lookups.
 * T6. Return { lat, lng, formattedAddress, placeId }.
 *
 * Region centroid fallback:
 * T7. If address is a region slug (e.g., "kc_metro", "statewide") → resolve to a known centroid.
 * T8. Centroid lookups bypass the Google API entirely.
 */
import { makeRequest, type GeocodingResult } from "./_core/map";
import { db } from "./db";
import { geocodeCache } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Region Centroid Map ─────────────────────────────────────────────
// Pre-computed centroids for registry region slugs.
// These bypass the geocoding API entirely.
export const REGION_CENTROIDS: Record<string, { lat: number; lng: number; label: string }> = {
  // Arizona
  "AZ:statewide":       { lat: 34.0489, lng: -111.0937, label: "Arizona" },
  "AZ:phoenix_metro":   { lat: 33.4484, lng: -112.0740, label: "Phoenix, AZ" },
  "AZ:tucson_metro":    { lat: 32.2226, lng: -110.9747, label: "Tucson, AZ" },
  "AZ:northern_az":     { lat: 35.1983, lng: -111.6513, label: "Flagstaff, AZ" },
  "AZ:tribal_nation":   { lat: 36.0672, lng: -111.0937, label: "Navajo Nation, AZ" },
  // Illinois
  "IL:statewide":       { lat: 40.6331, lng: -89.3985, label: "Illinois" },
  "IL:chicago":         { lat: 41.8781, lng: -87.6298, label: "Chicago, IL" },
  "IL:cook_county":     { lat: 41.8119, lng: -87.6873, label: "Cook County, IL" },
  "IL:collar_counties": { lat: 41.7508, lng: -88.1535, label: "Collar Counties, IL" },
  "IL:northern_central": { lat: 42.2711, lng: -89.0940, label: "Rockford, IL" },
  "IL:southern_central": { lat: 39.7817, lng: -89.6501, label: "Springfield, IL" },
  "IL:southern_il":     { lat: 37.7270, lng: -89.2167, label: "Carbondale, IL" },
  // California
  "CA:statewide":       { lat: 36.7783, lng: -119.4179, label: "California" },
  "CA:la_metro":        { lat: 34.0522, lng: -118.2437, label: "Los Angeles, CA" },
  "CA:sf_bay_area":     { lat: 37.7749, lng: -122.4194, label: "San Francisco, CA" },
  // Missouri
  "MO:statewide":       { lat: 38.5767, lng: -92.1736, label: "Missouri" },
  "MO:kc_metro":        { lat: 39.0997, lng: -94.5786, label: "Kansas City, MO" },
  "MO:stl_metro":       { lat: 38.6270, lng: -90.1994, label: "St. Louis, MO" },
  // Oregon
  "OR:statewide":       { lat: 43.8041, lng: -120.5542, label: "Oregon" },
  "OR:portland_metro":   { lat: 45.5152, lng: -122.6784, label: "Portland, OR" },
  "OR:tribal_nation":   { lat: 44.9429, lng: -123.0351, label: "Grand Ronde, OR" },
  // Pennsylvania
  "PA:statewide":       { lat: 41.2033, lng: -77.1945, label: "Pennsylvania" },
  "PA:philadelphia_metro": { lat: 39.9526, lng: -75.1652, label: "Philadelphia, PA" },
  "PA:pittsburgh_metro": { lat: 40.4406, lng: -79.9959, label: "Pittsburgh, PA" },
  // Washington
  "WA:statewide":       { lat: 47.7511, lng: -120.7401, label: "Washington" },
  "WA:seattle_metro":   { lat: 47.6062, lng: -122.3321, label: "Seattle, WA" },
  // Florida
  "FL:statewide":       { lat: 27.6648, lng: -81.5158, label: "Florida" },
  "FL:south_florida":   { lat: 25.7617, lng: -80.1918, label: "South Florida" },
  "FL:central_florida": { lat: 28.5383, lng: -81.3792, label: "Central Florida" },
  "FL:north_florida":   { lat: 30.3322, lng: -81.6557, label: "North Florida" },
  // New York
  "NY:statewide":       { lat: 40.7128, lng: -74.0060, label: "New York" },
  "NY:nyc_metro":       { lat: 40.7128, lng: -74.0060, label: "New York City" },
  "NY:upstate":         { lat: 42.6526, lng: -73.7562, label: "Upstate New York" },
  // Texas
  "TX:statewide":       { lat: 31.9686, lng: -99.9018, label: "Texas" },
  "TX:dfw_metro":       { lat: 32.7767, lng: -96.7970, label: "Dallas-Fort Worth, TX" },
  "TX:houston_metro":   { lat: 29.7604, lng: -95.3698, label: "Houston, TX" },
  "TX:san_antonio":     { lat: 29.4241, lng: -98.4936, label: "San Antonio, TX" },
  "TX:austin":          { lat: 30.2672, lng: -97.7431, label: "Austin, TX" },
  // Ohio
  "OH:statewide":       { lat: 40.4173, lng: -82.9071, label: "Ohio" },
  // Colorado
  "CO:statewide":       { lat: 39.5501, lng: -105.7821, label: "Colorado" },
  "CO:denver_metro":    { lat: 39.7392, lng: -104.9903, label: "Denver, CO" },
  // Georgia
  "GA:statewide":       { lat: 32.1656, lng: -82.9001, label: "Georgia" },
  "GA:atlanta_metro":   { lat: 33.7490, lng: -84.3880, label: "Atlanta, GA" },
  // Indiana
  "IN:statewide":       { lat: 40.2672, lng: -86.1349, label: "Indiana" },
  "IN:indianapolis_metro": { lat: 39.7684, lng: -86.1581, label: "Indianapolis, IN" },
  // Kentucky
  "KY:statewide":       { lat: 37.8393, lng: -84.2700, label: "Kentucky" },
  "KY:louisville_metro": { lat: 38.2527, lng: -85.7585, label: "Louisville, KY" },
  "KY:lexington_metro":  { lat: 38.0406, lng: -84.5037, label: "Lexington, KY" },
  // Michigan
  "MI:statewide":       { lat: 44.3148, lng: -85.6024, label: "Michigan" },
  "MI:detroit_wayne":   { lat: 42.3314, lng: -83.0458, label: "Detroit, MI" },
  "MI:southeast":       { lat: 42.3314, lng: -83.0458, label: "SE Michigan" },
  "MI:upper_peninsula": { lat: 46.5436, lng: -87.3954, label: "Upper Peninsula, MI" },
  // Minnesota
  "MN:statewide":       { lat: 46.7296, lng: -94.6859, label: "Minnesota" },
  "MN:twin_cities":     { lat: 44.9778, lng: -93.2650, label: "Minneapolis-St. Paul, MN" },
  // Wisconsin
  "WI:statewide":       { lat: 43.7844, lng: -88.7879, label: "Wisconsin" },
  "WI:milwaukee_metro": { lat: 43.0389, lng: -87.9065, label: "Milwaukee, WI" },
  "WI:madison_metro":   { lat: 43.0731, lng: -89.4012, label: "Madison, WI" },
  "OH:Columbus":        { lat: 39.9612, lng: -82.9988, label: "Columbus, OH" },
  "OH:Cleveland":       { lat: 41.4993, lng: -81.6944, label: "Cleveland, OH" },
  "OH:Cincinnati":      { lat: 39.1031, lng: -84.5120, label: "Cincinnati, OH" },
  "OH:Akron":           { lat: 41.0814, lng: -81.5190, label: "Akron, OH" },
  "OH:Toledo":          { lat: 41.6528, lng: -83.5379, label: "Toledo, OH" },
  "OH:Dayton":          { lat: 39.7589, lng: -84.1916, label: "Dayton, OH" },
  "OH:Youngstown":      { lat: 41.0998, lng: -80.6495, label: "Youngstown, OH" },
  "OH:Appalachian_SE":  { lat: 39.3292, lng: -82.1013, label: "Athens, OH" },
  // Alabama
  "AL:statewide":        { lat: 32.3182, lng: -86.9023, label: "Alabama" },
  "AL:birmingham_metro":  { lat: 33.5186, lng: -86.8104, label: "Birmingham, AL" },
  "AL:montgomery_metro":  { lat: 32.3668, lng: -86.3000, label: "Montgomery, AL" },
  "AL:huntsville_metro":  { lat: 34.7304, lng: -86.5861, label: "Huntsville, AL" },
  // Mississippi
  "MS:statewide":        { lat: 32.3547, lng: -89.3985, label: "Mississippi" },
  "MS:jackson_metro":    { lat: 32.2988, lng: -90.1848, label: "Jackson, MS" },
  "MS:gulf_coast":       { lat: 30.3960, lng: -88.8853, label: "Biloxi, MS" },
  "MS:delta":            { lat: 33.8779, lng: -90.7273, label: "Mound Bayou, MS" },
  // Arkansas
  "AR:statewide":        { lat: 35.2010, lng: -91.8318, label: "Arkansas" },
  "AR:little_rock_metro": { lat: 34.7465, lng: -92.2896, label: "Little Rock, AR" },
  "AR:nwa_metro":        { lat: 36.0822, lng: -94.1719, label: "Fayetteville, AR" },
  // Maryland
  "MD:statewide":        { lat: 39.0458, lng: -76.6413, label: "Maryland" },
  "MD:baltimore_metro":  { lat: 39.2904, lng: -76.6122, label: "Baltimore, MD" },
  "MD:dc_suburbs":       { lat: 38.9907, lng: -77.0261, label: "Silver Spring, MD" },
  // New Jersey
  "NJ:statewide":        { lat: 40.0583, lng: -74.4057, label: "New Jersey" },
  "NJ:newark_metro":     { lat: 40.7357, lng: -74.1724, label: "Newark, NJ" },
  "NJ:trenton_metro":    { lat: 40.2171, lng: -74.7429, label: "Trenton, NJ" },
  // Connecticut
  "CT:statewide":        { lat: 41.6032, lng: -73.0877, label: "Connecticut" },
  "CT:hartford_metro":   { lat: 41.7658, lng: -72.6734, label: "Hartford, CT" },
  "CT:new_haven_metro":  { lat: 41.3083, lng: -72.9279, label: "New Haven, CT" },
  // Montana
  "MT:statewide":        { lat: 46.8797, lng: -110.3626, label: "Montana" },
  "MT:helena_metro":     { lat: 46.5891, lng: -112.0391, label: "Helena, MT" },
  // Wyoming
  "WY:statewide":        { lat: 43.0760, lng: -107.2903, label: "Wyoming" },
  "WY:cheyenne_metro":   { lat: 41.1400, lng: -104.8202, label: "Cheyenne, WY" },
  "WY:casper_metro":     { lat: 42.8666, lng: -106.3131, label: "Casper, WY" },
  "WY:fort_washakie":    { lat: 42.9833, lng: -108.8828, label: "Fort Washakie, WY" },
  // New Mexico
  "NM:statewide":        { lat: 34.5199, lng: -105.8701, label: "New Mexico" },
  "NM:albuquerque_metro": { lat: 35.0844, lng: -106.6504, label: "Albuquerque, NM" },
  "NM:santa_fe_metro":   { lat: 35.6870, lng: -105.9378, label: "Santa Fe, NM" },
  "NM:navajo_gateway":   { lat: 35.5281, lng: -108.7426, label: "Gallup, NM" },
  // Utah
  "UT:statewide":        { lat: 39.3210, lng: -111.0937, label: "Utah" },
  "UT:slc_metro":        { lat: 40.7608, lng: -111.8910, label: "Salt Lake City, UT" },
  "UT:provo_metro":      { lat: 40.2338, lng: -111.6585, label: "Provo, UT" },
  "UT:navajo_nation":    { lat: 37.6241, lng: -109.4785, label: "Blanding, UT" },
  "UT:fort_duchesne":    { lat: 40.2886, lng: -109.8632, label: "Fort Duchesne, UT" },
  "UT:uintah_basin":     { lat: 40.2886, lng: -109.8632, label: "Uintah Basin, UT" },
  // Additional statewide entries
  "AK:statewide":        { lat: 64.2008, lng: -152.4937, label: "Alaska" },
  "DE:statewide":        { lat: 39.1582, lng: -75.5244, label: "Delaware" },
  "HI:statewide":        { lat: 19.8968, lng: -155.5828, label: "Hawaii" },
  "ID:statewide":        { lat: 44.0682, lng: -114.7420, label: "Idaho" },
  "IA:statewide":        { lat: 41.8780, lng: -93.0977, label: "Iowa" },
  "KS:statewide":        { lat: 39.0119, lng: -98.4842, label: "Kansas" },
  "LA:statewide":        { lat: 30.9843, lng: -91.9623, label: "Louisiana" },
  "ME:statewide":        { lat: 45.2538, lng: -69.4455, label: "Maine" },
  "MA:statewide":        { lat: 42.4072, lng: -71.3824, label: "Massachusetts" },
  "NE:statewide":        { lat: 41.4925, lng: -99.9018, label: "Nebraska" },
  "NV:statewide":        { lat: 38.8026, lng: -116.4194, label: "Nevada" },
  "NH:statewide":        { lat: 43.1939, lng: -71.5724, label: "New Hampshire" },
  "NC:statewide":        { lat: 35.7596, lng: -79.0193, label: "North Carolina" },
  "ND:statewide":        { lat: 47.5515, lng: -101.0020, label: "North Dakota" },
  "OK:statewide":        { lat: 35.0078, lng: -97.0929, label: "Oklahoma" },
  "RI:statewide":        { lat: 41.5801, lng: -71.4774, label: "Rhode Island" },
  "SC:statewide":        { lat: 33.8361, lng: -81.1637, label: "South Carolina" },
  "SD:statewide":        { lat: 43.9695, lng: -99.9018, label: "South Dakota" },
  "TN:statewide":        { lat: 35.5175, lng: -86.5804, label: "Tennessee" },
  "VT:statewide":        { lat: 44.5588, lng: -72.5778, label: "Vermont" },
  "VA:statewide":        { lat: 37.4316, lng: -78.6569, label: "Virginia" },
  "WV:statewide":        { lat: 38.5976, lng: -80.4549, label: "West Virginia" },
  "DC:statewide":        { lat: 38.9072, lng: -77.0369, label: "District of Columbia" },
  "PR:statewide":        { lat: 18.2208, lng: -66.5901, label: "Puerto Rico" },
  "GU:statewide":        { lat: 13.4443, lng: 144.7937, label: "Guam" },
  "AS:statewide":        { lat: -14.2710, lng: -170.1322, label: "American Samoa" },
  "MP:statewide":        { lat: 15.0979, lng: 145.6739, label: "Northern Mariana Islands" },
  "VI:statewide":        { lat: 18.3358, lng: -64.8963, label: "US Virgin Islands" },
};

// State-level centroids (fallback when only stateCode is known)
export const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AZ: { lat: 34.0489, lng: -111.0937 },
  CA: { lat: 36.7783, lng: -119.4179 },
  MO: { lat: 38.5767, lng: -92.1736 },
  OR: { lat: 43.8041, lng: -120.5542 },
  PA: { lat: 41.2033, lng: -77.1945 },
  WA: { lat: 47.7511, lng: -120.7401 },
  // Additional states for future expansion
  FL: { lat: 27.6648, lng: -81.5158 },
  NY: { lat: 40.7128, lng: -74.0060 },
  TX: { lat: 31.9686, lng: -99.9018 },
  IL: { lat: 40.6331, lng: -89.3985 },
  OH: { lat: 40.4173, lng: -82.9071 },
  GA: { lat: 32.1656, lng: -82.9001 },
  NC: { lat: 35.7596, lng: -79.0193 },
  MI: { lat: 44.3148, lng: -85.6024 },
  NJ: { lat: 40.0583, lng: -74.4057 },
  VA: { lat: 37.4316, lng: -78.6569 },
  CO: { lat: 39.5501, lng: -105.7821 },
  MA: { lat: 42.4072, lng: -71.3824 },
  IN: { lat: 40.2672, lng: -86.1349 },
  TN: { lat: 35.5175, lng: -86.5804 },
  MN: { lat: 46.7296, lng: -94.6859 },
  WI: { lat: 43.7844, lng: -88.7879 },
  MD: { lat: 39.0458, lng: -76.6413 },
  NM: { lat: 34.5199, lng: -105.8701 },
  NV: { lat: 38.8026, lng: -116.4194 },
  OK: { lat: 35.0078, lng: -97.0929 },
  CT: { lat: 41.6032, lng: -73.0877 },
  IA: { lat: 41.8780, lng: -93.0977 },
  KS: { lat: 39.0119, lng: -98.4842 },
  KY: { lat: 37.8393, lng: -84.2700 },
  LA: { lat: 30.9843, lng: -91.9623 },
  SC: { lat: 33.8361, lng: -81.1637 },
  AL: { lat: 32.3182, lng: -86.9023 },
  AR: { lat: 35.2010, lng: -91.8318 },
  MS: { lat: 32.3547, lng: -89.3985 },
  UT: { lat: 39.3210, lng: -111.0937 },
  MT: { lat: 46.8797, lng: -110.3626 },
  WY: { lat: 43.0760, lng: -107.2903 },
  HI: { lat: 19.8968, lng: -155.5828 },
  AK: { lat: 64.2008, lng: -152.4937 },
  DC: { lat: 38.9072, lng: -77.0369 },
  DE: { lat: 39.1582, lng: -75.5244 },
  ID: { lat: 44.0682, lng: -114.7420 },
  ME: { lat: 45.2538, lng: -69.4455 },
  NE: { lat: 41.4925, lng: -99.9018 },
  NH: { lat: 43.1939, lng: -71.5724 },
  ND: { lat: 47.5515, lng: -101.0020 },
  RI: { lat: 41.5801, lng: -71.4774 },
  SD: { lat: 43.9695, lng: -99.9018 },
  VT: { lat: 44.5588, lng: -72.5778 },
  WV: { lat: 38.5976, lng: -80.4549 },
  PR: { lat: 18.2208, lng: -66.5901 },
  GU: { lat: 13.4443, lng: 144.7937 },
  AS: { lat: -14.2710, lng: -170.1322 },
  MP: { lat: 15.0979, lng: 145.6739 },
  VI: { lat: 18.3358, lng: -64.8963 },
};

// ─── Normalize Address Key ───────────────────────────────────────────
export function normalizeAddressKey(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,#]/g, "");
}

// ─── Region Centroid Lookup ──────────────────────────────────────────
export function getRegionCentroid(
  stateCode: string,
  region: string
): { lat: number; lng: number; label: string } | null {
  const key = `${stateCode.toUpperCase()}:${region}`;
  return REGION_CENTROIDS[key] ?? null;
}

// ─── State Centroid Lookup ───────────────────────────────────────────
export function getStateCentroid(
  stateCode: string
): { lat: number; lng: number } | null {
  return STATE_CENTROIDS[stateCode.toUpperCase()] ?? null;
}

// ─── Geocode Result Type ─────────────────────────────────────────────
export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string | null;
  placeId: string | null;
  source: "cache" | "google" | "region_centroid" | "state_centroid";
}

// ─── Main Geocoding Function ─────────────────────────────────────────
/**
 * Geocode an address string to lat/lng coordinates.
 *
 * Resolution order:
 * 1. Check geocode_cache table.
 * 2. Call Google Maps Geocoding API.
 * 3. Store result in cache.
 *
 * For region slugs, use geocodeRegion() instead.
 */
export async function geocodeAddress(address: string): Promise<GeocodedLocation | null> {
  if (!address || address.trim().length < 3) return null;

  const addressKey = normalizeAddressKey(address);

  // T2. Check cache
  const cached = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.addressKey, addressKey))
    .limit(1);

  if (cached.length > 0) {
    const c = cached[0];
    return {
      lat: c.lat,
      lng: c.lng,
      formattedAddress: c.formattedAddress,
      placeId: c.placeId,
      source: "cache",
    };
  }

  // T4. Call Google Maps Geocoding API
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address,
    });

    if (result.status !== "OK" || !result.results?.length) {
      return null;
    }

    const first = result.results[0];
    const lat = first.geometry.location.lat;
    const lng = first.geometry.location.lng;
    const formattedAddress = first.formatted_address;
    const placeId = first.place_id;

    // T5. Store in cache
    await db.insert(geocodeCache).values({
      addressKey,
      formattedAddress,
      lat,
      lng,
      placeId,
      source: "google",
      createdAt: Date.now(),
    }).onDuplicateKeyUpdate({
      set: { lat, lng, formattedAddress, placeId },
    });

    return { lat, lng, formattedAddress, placeId, source: "google" };
  } catch (err) {
    console.error("[Geocoding] API error:", err);
    return null;
  }
}

// ─── Geocode a Region Slug ───────────────────────────────────────────
/**
 * Resolve a registry region slug (e.g., "kc_metro") to coordinates.
 * Falls back to state centroid if region is unknown.
 */
export function geocodeRegion(
  stateCode: string,
  region: string
): GeocodedLocation | null {
  const centroid = getRegionCentroid(stateCode, region);
  if (centroid) {
    return {
      lat: centroid.lat,
      lng: centroid.lng,
      formattedAddress: centroid.label,
      placeId: null,
      source: "region_centroid",
    };
  }

  // Fallback to state centroid
  const stateCentroid = getStateCentroid(stateCode);
  if (stateCentroid) {
    return {
      lat: stateCentroid.lat,
      lng: stateCentroid.lng,
      formattedAddress: stateCode.toUpperCase(),
      placeId: null,
      source: "state_centroid",
    };
  }

  return null;
}

// ─── Batch Geocode ───────────────────────────────────────────────────
/**
 * Geocode multiple addresses in sequence with cache optimization.
 * Returns a map of address → GeocodedLocation.
 */
export async function batchGeocode(
  addresses: string[]
): Promise<Map<string, GeocodedLocation>> {
  const results = new Map<string, GeocodedLocation>();
  for (const addr of addresses) {
    const result = await geocodeAddress(addr);
    if (result) {
      results.set(addr, result);
    }
  }
  return results;
}

// ─── Manual Cache Insert ─────────────────────────────────────────────
/**
 * Manually insert a geocode entry (for admin corrections or bulk imports).
 */
export async function insertManualGeocode(
  address: string,
  lat: number,
  lng: number,
  formattedAddress?: string
): Promise<void> {
  const addressKey = normalizeAddressKey(address);
  await db.insert(geocodeCache).values({
    addressKey,
    formattedAddress: formattedAddress ?? address,
    lat,
    lng,
    placeId: null,
    source: "manual",
    createdAt: Date.now(),
  }).onDuplicateKeyUpdate({
    set: { lat, lng, formattedAddress: formattedAddress ?? address, source: "manual" as const },
  });
}
