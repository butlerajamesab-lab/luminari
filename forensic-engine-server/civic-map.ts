/**
 * Civic Map — Aggregation Layer
 *
 * Produces the structured response for lighthouse.map.layers.
 * Combines registry resources, lighthouse community items, and
 * privacy-safe pipeline signal clusters into a single payload.
 *
 * Data flow:
 * T1. Load registry programs, oversight bodies, and tribal entities from JSON config files.
 * T2. Resolve each item's geographic coordinates via region centroids (no API call).
 * T3. Query lighthouse_jobs, lighthouse_posts, lighthouse_events for geocoded items.
 * T4. Query pipeline_events, aggregate by (pipelineType, stateCode).
 * T5. Apply privacy thresholds: suppress clusters with count < MIN_SIGNAL_COUNT.
 * T6. Apply coordinate jitter: offset lat/lng by random ±JITTER_RADIUS.
 * T7. Return combined MapLayersResponse.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as db from "./db";
import { geocodeRegion, getStateCentroid, STATE_CENTROIDS, normalizeAddressKey } from "./geocoding";
import { geocodeCache } from "../drizzle/schema";
// drizzle-orm operators imported as needed

const __dirname = dirname(fileURLToPath(import.meta.url));
const statesDir = join(__dirname, "config", "states");

// ─── Cache Layer ────────────────────────────────────────────────────
/** Registry resources are static JSON files — cache them in memory for 10 minutes */
const REGISTRY_CACHE_TTL = 10 * 60 * 1000;
const registryCache = new Map<string, { data: MapResource[]; ts: number }>();

/** Full map layers cache — keyed by stateCode filter, TTL 2 minutes */
const MAP_LAYERS_CACHE_TTL = 2 * 60 * 1000;
const mapLayersCache = new Map<string, { data: MapLayersResponse; ts: number }>();

// ─── Privacy Constants ───────────────────────────────────────────────
/** Minimum event count before a pipeline signal is surfaced on the map */
const MIN_SIGNAL_COUNT = 3;
/** Maximum random coordinate jitter in degrees (~800m at equator) */
const JITTER_RADIUS = 0.008;

// ─── Types ───────────────────────────────────────────────────────────

export interface MapResource {
  type: "program" | "oversight" | "tribal_entity" | "urban_indian_program";
  id: string;
  name: string;
  stateCode: string;
  region: string;
  lat: number;
  lng: number;
  category?: string;
  phone?: string;
  website?: string;
  agency?: string;
  services?: string[];
  coverage?: string;
  street_address?: string;
  city?: string;
  zip?: string;
  geocodeSource?: "address" | "geocoded" | "region_centroid" | "state_centroid";
}

export interface MapJob {
  type: "job";
  id: number;
  title: string;
  organization: string;
  jobType: string;
  category: string;
  location: string | null;
  stateCode: string | null;
  lat: number | null;
  lng: number | null;
  compensation: string | null;
  remote: boolean;
  url: string | null;
}

export interface MapPost {
  type: "post";
  id: number;
  title: string;
  category: string;
  location: string | null;
  stateCode: string | null;
  lat: number | null;
  lng: number | null;
  authorName: string | null;
}

export interface MapWorkshop {
  type: "workshop" | "training" | "community_meeting" | "legal_clinic" | "resource_fair" | "tribal_gathering" | "other";
  id: number;
  title: string;
  organization: string | null;
  location: string | null;
  stateCode: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: number;
  endsAt: number | null;
  url: string | null;
}

export interface MapPatternSignal {
  type: "pattern_signal";
  pipeline: string;
  stateCode: string;
  lat: number;
  lng: number;
  count: number;
  /** Approximate radius in meters for the cluster visualization */
  radius: number;
}

export interface MapLayersResponse {
  resources: MapResource[];
  jobs: MapJob[];
  posts: MapPost[];
  workshops: MapWorkshop[];
  tribal_events: MapWorkshop[];
  pattern_signals: MapPatternSignal[];
  meta: {
    states_loaded: string[];
    total_resources: number;
    total_jobs: number;
    total_posts: number;
    total_workshops: number;
    total_tribal_events: number;
    total_pattern_signals: number;
    signal_window_days: number;
    privacy_threshold: number;
  };
}

// ─── Registry Resource Extraction ────────────────────────────────────

function loadJSON<T>(filepath: string): T | null {
  try {
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Resolve geographic coordinates for a registry entry.
 * Priority: street_address + city + state > region centroid > state centroid.
 * Uses a simple city-based geocoding lookup for address-audited entries.
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // AZ
  "phoenix_az": { lat: 33.4484, lng: -112.0740 },
  "tucson_az": { lat: 32.2226, lng: -110.9747 },
  "flagstaff_az": { lat: 35.1983, lng: -111.6513 },
  "mesa_az": { lat: 33.4152, lng: -111.8315 },
  "scottsdale_az": { lat: 33.4942, lng: -111.9261 },
  "window rock_az": { lat: 35.6814, lng: -109.0524 },
  // CA
  "sacramento_ca": { lat: 38.5816, lng: -121.4944 },
  "los angeles_ca": { lat: 34.0522, lng: -118.2437 },
  "san francisco_ca": { lat: 37.7749, lng: -122.4194 },
  "san diego_ca": { lat: 32.7157, lng: -117.1611 },
  "oakland_ca": { lat: 37.8044, lng: -122.2712 },
  "long beach_ca": { lat: 33.7701, lng: -118.1937 },
  "fresno_ca": { lat: 36.7378, lng: -119.7871 },
  "city of industry_ca": { lat: 34.0197, lng: -117.9587 },
  "elk grove_ca": { lat: 38.4088, lng: -121.3716 },
  "pacoima_ca": { lat: 34.2764, lng: -118.4190 },
  // FL
  "tallahassee_fl": { lat: 30.4383, lng: -84.2807 },
  "miami_fl": { lat: 25.7617, lng: -80.1918 },
  "tampa_fl": { lat: 27.9506, lng: -82.4572 },
  "orlando_fl": { lat: 28.5383, lng: -81.3792 },
  "fort lauderdale_fl": { lat: 26.1224, lng: -80.1373 },
  "jacksonville_fl": { lat: 30.3322, lng: -81.6557 },
  "gainesville_fl": { lat: 29.6516, lng: -82.3248 },
  "hollywood_fl": { lat: 26.0112, lng: -80.1495 },
  "homestead_fl": { lat: 25.4687, lng: -80.4776 },
  // IL
  "chicago_il": { lat: 41.8781, lng: -87.6298 },
  "springfield_il": { lat: 39.7817, lng: -89.6501 },
  "rockford_il": { lat: 42.2711, lng: -89.0940 },
  // MO
  "jefferson city_mo": { lat: 38.5767, lng: -92.1735 },
  "kansas city_mo": { lat: 39.0997, lng: -94.5786 },
  "st. louis_mo": { lat: 38.6270, lng: -90.1994 },
  "columbia_mo": { lat: 38.9517, lng: -92.3341 },
  // NY
  "albany_ny": { lat: 42.6526, lng: -73.7562 },
  "new york_ny": { lat: 40.7128, lng: -74.0060 },
  "bronx_ny": { lat: 40.8448, lng: -73.8648 },
  "brooklyn_ny": { lat: 40.6782, lng: -73.9442 },
  "rochester_ny": { lat: 43.1566, lng: -77.6088 },
  "buffalo_ny": { lat: 42.8864, lng: -78.8784 },
  "syracuse_ny": { lat: 43.0481, lng: -76.1474 },
  "hogansburg_ny": { lat: 44.9798, lng: -74.6643 },
  "irving_ny": { lat: 42.5598, lng: -79.0645 },
  // OR
  "portland_or": { lat: 45.5152, lng: -122.6784 },
  "salem_or": { lat: 44.9429, lng: -123.0351 },
  "eugene_or": { lat: 44.0521, lng: -123.0868 },
  "coos bay_or": { lat: 43.3665, lng: -124.2179 },
  "roseburg_or": { lat: 43.2165, lng: -123.3417 },
  "tigard_or": { lat: 45.4312, lng: -122.7715 },
  "grand ronde_or": { lat: 45.0554, lng: -123.6151 },
  "warm springs_or": { lat: 44.7632, lng: -121.2651 },
  "woodburn_or": { lat: 45.1437, lng: -122.8554 },
  // PA
  "harrisburg_pa": { lat: 40.2732, lng: -76.8867 },
  "philadelphia_pa": { lat: 39.9526, lng: -75.1652 },
  "pittsburgh_pa": { lat: 40.4406, lng: -79.9959 },
  "washington_pa": { lat: 40.1740, lng: -80.2462 },
  // TX
  "austin_tx": { lat: 30.2672, lng: -97.7431 },
  "houston_tx": { lat: 29.7604, lng: -95.3698 },
  "dallas_tx": { lat: 32.7767, lng: -96.7970 },
  "san antonio_tx": { lat: 29.4241, lng: -98.4936 },
  "el paso_tx": { lat: 31.7619, lng: -106.4850 },
  "fort worth_tx": { lat: 32.7555, lng: -97.3308 },
  "eagle pass_tx": { lat: 28.7091, lng: -100.4995 },
  "plano_tx": { lat: 33.0198, lng: -96.6989 },
  "lubbock_tx": { lat: 33.5779, lng: -101.8552 },
  "livingston_tx": { lat: 30.7113, lng: -94.9330 },
  // OH
  "columbus_oh": { lat: 39.9612, lng: -82.9988 },
  "cleveland_oh": { lat: 41.4993, lng: -81.6944 },
  "cincinnati_oh": { lat: 39.1031, lng: -84.5120 },
  "akron_oh": { lat: 41.0814, lng: -81.5190 },
  "toledo_oh": { lat: 41.6528, lng: -83.5379 },
  "dayton_oh": { lat: 39.7589, lng: -84.1916 },
  "youngstown_oh": { lat: 41.0998, lng: -80.6495 },
  "athens_oh": { lat: 39.3292, lng: -82.1013 },
  "grove city_oh": { lat: 39.8812, lng: -83.0930 },
  // WA
  "olympia_wa": { lat: 47.0379, lng: -122.9007 },
  "seattle_wa": { lat: 47.6062, lng: -122.3321 },
  "tacoma_wa": { lat: 47.2529, lng: -122.4443 },
  "federal way_wa": { lat: 47.3223, lng: -122.3126 },
  "bellevue_wa": { lat: 47.6101, lng: -122.2015 },
  "yakima_wa": { lat: 46.6021, lng: -120.5059 },
  "bellingham_wa": { lat: 48.7519, lng: -122.4787 },
  "tulalip_wa": { lat: 48.0690, lng: -122.2910 },
  "auburn_wa": { lat: 47.3073, lng: -122.2285 },
  "pasco_wa": { lat: 46.2396, lng: -119.1006 },
  "tumwater_wa": { lat: 46.9712, lng: -122.9093 },
  // Tribal entity cities
  "eureka_ca": { lat: 40.8021, lng: -124.1637 },
  "ukiah_ca": { lat: 39.1502, lng: -123.2078 },
  "porterville_ca": { lat: 36.0652, lng: -119.0168 },
  "burns_or": { lat: 43.5863, lng: -119.0541 },
  "siletz_or": { lat: 44.7212, lng: -123.9218 },
  "pendleton_or": { lat: 45.6721, lng: -118.7886 },
  "klamath falls_or": { lat: 42.2249, lng: -121.7817 },
  "alpine_ca": { lat: 32.8351, lng: -116.7664 },
  // CO
  "denver_co": { lat: 39.7392, lng: -104.9903 },
  "colorado springs_co": { lat: 38.8339, lng: -104.8214 },
  "aurora_co": { lat: 39.7294, lng: -104.8319 },
  "lakewood_co": { lat: 39.7047, lng: -105.0814 },
  "durango_co": { lat: 37.2753, lng: -107.8801 },
  // GA
  "atlanta_ga": { lat: 33.7490, lng: -84.3880 },
  // IN
  "indianapolis_in": { lat: 39.7684, lng: -86.1581 },
  "crown point_in": { lat: 41.4170, lng: -87.3653 },
  "south bend_in": { lat: 41.6764, lng: -86.2520 },
  // KY
  "frankfort_ky": { lat: 38.2009, lng: -84.8733 },
  "louisville_ky": { lat: 38.2527, lng: -85.7585 },
  "lexington_ky": { lat: 38.0406, lng: -84.5037 },
  "catlettsburg_ky": { lat: 38.4048, lng: -82.6013 },
  "prestonsburg_ky": { lat: 37.6654, lng: -82.7716 },
  "richmond_ky": { lat: 37.7479, lng: -84.2947 },
  // MI
  "lansing_mi": { lat: 42.7325, lng: -84.5555 },
  "detroit_mi": { lat: 42.3314, lng: -83.0458 },
  "dearborn_mi": { lat: 42.3223, lng: -83.1763 },
  "marquette_mi": { lat: 46.5436, lng: -87.3954 },
  "mt. pleasant_mi": { lat: 43.5978, lng: -84.7675 },
  "traverse city_mi": { lat: 44.7631, lng: -85.6206 },
  "petoskey_mi": { lat: 45.3733, lng: -84.9553 },
  "dowagiac_mi": { lat: 41.9842, lng: -86.1086 },
  "battle creek_mi": { lat: 42.3212, lng: -85.1797 },
  "allegan_mi": { lat: 42.5292, lng: -85.8553 },
  "baraga_mi": { lat: 46.7783, lng: -88.4890 },
  "watersmeet_mi": { lat: 46.2750, lng: -89.1751 },
  "brimley_mi": { lat: 46.4086, lng: -84.5569 },
  "sault ste. marie_mi": { lat: 46.4953, lng: -84.3453 },
  "wilson_mi": { lat: 45.7936, lng: -87.0578 },
  "manistee_mi": { lat: 44.2442, lng: -86.3253 },
  // MN
  "st. paul_mn": { lat: 44.9537, lng: -93.0900 },
  "saint paul_mn": { lat: 44.9537, lng: -93.0900 },
  "minneapolis_mn": { lat: 44.9778, lng: -93.2650 },
  "brooklyn park_mn": { lat: 45.0941, lng: -93.3563 },
  "bemidji_mn": { lat: 47.4736, lng: -94.8803 },
  "cass lake_mn": { lat: 47.3797, lng: -94.6036 },
  "red lake_mn": { lat: 47.8764, lng: -95.0169 },
  "white earth_mn": { lat: 47.0919, lng: -95.8428 },
  "cloquet_mn": { lat: 46.7219, lng: -92.4614 },
  "onamia_mn": { lat: 46.0694, lng: -93.6772 },
  "prior lake_mn": { lat: 44.7133, lng: -93.4227 },
  "granite falls_mn": { lat: 44.8103, lng: -95.5453 },
  "morton_mn": { lat: 44.5558, lng: -94.9858 },
  "grand portage_mn": { lat: 47.9600, lng: -89.6853 },
  "nett lake_mn": { lat: 48.1108, lng: -93.0922 },
  "welch_mn": { lat: 44.5636, lng: -92.7277 },
  // WI
  "madison_wi": { lat: 43.0731, lng: -89.4012 },
  "milwaukee_wi": { lat: 43.0389, lng: -87.9065 },
  "green bay_wi": { lat: 44.5133, lng: -88.0133 },
  "wausau_wi": { lat: 44.9591, lng: -89.6301 },
  "keshena_wi": { lat: 44.8844, lng: -88.6332 },
  "lac du flambeau_wi": { lat: 45.9697, lng: -89.8918 },
  "odanah_wi": { lat: 46.6122, lng: -90.6768 },
  "black river falls_wi": { lat: 44.2944, lng: -90.8515 },
  // AL
  "montgomery_al": { lat: 32.3668, lng: -86.3000 },
  "birmingham_al": { lat: 33.5186, lng: -86.8104 },
  "huntsville_al": { lat: 34.7304, lng: -86.5861 },
  "atmore_al": { lat: 31.0240, lng: -87.4936 },
  // MS
  "jackson_ms": { lat: 32.2988, lng: -90.1848 },
  "biloxi_ms": { lat: 30.3960, lng: -88.8853 },
  "mound bayou_ms": { lat: 33.8779, lng: -90.7273 },
  "philadelphia_ms": { lat: 32.7715, lng: -89.1168 },
  // AR
  "little rock_ar": { lat: 34.7465, lng: -92.2896 },
  "fayetteville_ar": { lat: 36.0822, lng: -94.1719 },
  "springdale_ar": { lat: 36.1867, lng: -94.1288 },
  "batesville_ar": { lat: 35.7698, lng: -91.6410 },
  // MD
  "baltimore_md": { lat: 39.2904, lng: -76.6122 },
  "silver spring_md": { lat: 38.9907, lng: -77.0261 },
  "lanham_md": { lat: 38.9687, lng: -76.8633 },
  // NJ
  "trenton_nj": { lat: 40.2171, lng: -74.7429 },
  "newark_nj": { lat: 40.7357, lng: -74.1724 },
  "edison_nj": { lat: 40.5187, lng: -74.4121 },
  // CT
  "hartford_ct": { lat: 41.7658, lng: -72.6734 },
  "new haven_ct": { lat: 41.3083, lng: -72.9279 },
  "wethersfield_ct": { lat: 41.7143, lng: -72.6526 },
  "mashantucket_ct": { lat: 41.4779, lng: -71.9601 },
  "uncasville_ct": { lat: 41.4345, lng: -72.1079 },
  // MT
  "helena_mt": { lat: 46.5891, lng: -112.0391 },
  "browning_mt": { lat: 48.5566, lng: -113.0132 },
  "lame deer_mt": { lat: 45.6233, lng: -106.6667 },
  "poplar_mt": { lat: 48.1106, lng: -105.1991 },
  // WY
  "cheyenne_wy": { lat: 41.1400, lng: -104.8202 },
  "casper_wy": { lat: 42.8666, lng: -106.3131 },
  "fort washakie_wy": { lat: 42.9833, lng: -108.8828 },
  "ethete_wy": { lat: 42.9361, lng: -108.7592 },
  // NM
  "albuquerque_nm": { lat: 35.0844, lng: -106.6504 },
  "santa fe_nm": { lat: 35.6870, lng: -105.9378 },
  "las cruces_nm": { lat: 32.3199, lng: -106.7637 },
  "gallup_nm": { lat: 35.5281, lng: -108.7426 },
  // UT
  "salt lake city_ut": { lat: 40.7608, lng: -111.8910 },
  "west valley city_ut": { lat: 40.6916, lng: -112.0011 },
  "blanding_ut": { lat: 37.6241, lng: -109.4785 },
  "fort duchesne_ut": { lat: 40.2886, lng: -109.8632 },
  // Other
  "nashville_tn": { lat: 36.1627, lng: -86.7816 },
  "washington_dc": { lat: 38.9072, lng: -77.0369 },
  "boston_ma": { lat: 42.3601, lng: -71.0589 },
  // Cross-reference additions (Session 44)
  "halethorpe_md": { lat: 39.2365, lng: -76.6783 },
  "hunt valley_md": { lat: 39.4982, lng: -76.6413 },
  "hillside_nj": { lat: 40.6965, lng: -74.2296 },
  "wallingford_ct": { lat: 41.4570, lng: -72.8232 },
  "rocky hill_ct": { lat: 41.6643, lng: -72.6401 },
  "willimantic_ct": { lat: 41.7107, lng: -72.2079 },
};


/** In-memory geocode cache populated from DB at startup / on demand */
const geocodeLookup = new Map<string, { lat: number; lng: number }>();
let geocodeLookupLoaded = false;

async function loadGeocodeLookup(): Promise<void> {
  if (geocodeLookupLoaded) return;
  try {
    const rows = await db.db.select({
      addressKey: geocodeCache.addressKey,
      lat: geocodeCache.lat,
      lng: geocodeCache.lng,
    }).from(geocodeCache);
    for (const r of rows) {
      geocodeLookup.set(r.addressKey, { lat: r.lat, lng: r.lng });
    }
    geocodeLookupLoaded = true;
    console.log(`[CivicMap] Loaded ${rows.length} geocode cache entries`);
  } catch (err) {
    console.error("[CivicMap] Failed to load geocode cache:", err);
  }
}

/** Invalidate the in-memory geocode lookup so next call reloads from DB */
export function invalidateGeocodeLookup() {
  geocodeLookupLoaded = false;
  geocodeLookup.clear();
}

function resolveGeo(
  stateCode: string,
  region: string,
  entry: any
): { lat: number; lng: number; source: string } | null {
  // Priority 0: Check geocode_cache for precise street-level coordinates
  if (entry.street_address && entry.city && (entry.state_code || entry.state)) {
    const st = (entry.state_code || entry.state || stateCode).toUpperCase();
    const fullAddress = `${entry.street_address}, ${entry.city}, ${st} ${entry.zip ?? ""}`.trim();
    const addressKey = normalizeAddressKey(fullAddress);
    const cached = geocodeLookup.get(addressKey);
    if (cached) {
      return { lat: cached.lat, lng: cached.lng, source: "geocoded" };
    }
  }
  // Priority 1: Use street address + city + state for city-level geocoding with offset
  if (entry.street_address && entry.city && (entry.state_code || entry.state)) {
    const st = (entry.state_code || entry.state || stateCode).toUpperCase();
    const cityKey = `${entry.city.toLowerCase()}_${st.toLowerCase()}`;
    const cityGeo = CITY_COORDS[cityKey];
    if (cityGeo) {
      // Add small offset based on address hash to spread pins within a city
      const hash = simpleHash(entry.street_address);
      const offsetLat = ((hash % 100) - 50) * 0.0003;
      const offsetLng = (((hash >> 8) % 100) - 50) * 0.0003;
      return {
        lat: cityGeo.lat + offsetLat,
        lng: cityGeo.lng + offsetLng,
        source: "address",
      };
    }
  }
  // Priority 1.5: City-only geocoding (enriched entries without street address)
  if (entry.city && (entry.state_code || entry.state || stateCode)) {
    const st = (entry.state_code || entry.state || stateCode).toUpperCase();
    const cityKey = `${entry.city.toLowerCase()}_${st.toLowerCase()}`;
    const cityGeo = CITY_COORDS[cityKey];
    if (cityGeo) {
      // Add offset based on program name hash to spread pins within city
      const hash = simpleHash(entry.program_name || entry.name || entry.body_id || "");
      const offsetLat = ((hash % 100) - 50) * 0.0004;
      const offsetLng = (((hash >> 8) % 100) - 50) * 0.0004;
      return {
        lat: cityGeo.lat + offsetLat,
        lng: cityGeo.lng + offsetLng,
        source: "address",
      };
    }
  }
  // Priority 2: Region centroid
  const regionGeo = geocodeRegion(stateCode, region);
  if (regionGeo) {
    return { lat: regionGeo.lat, lng: regionGeo.lng, source: "region_centroid" };
  }
  // Priority 3: State centroid
  const stateGeo = getStateCentroid(stateCode);
  if (stateGeo) {
    return { lat: stateGeo.lat, lng: stateGeo.lng, source: "state_centroid" };
  }
  return null;
}

/** Simple string hash for deterministic pin spreading */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

async function extractRegistryResources(stateCode: string): Promise<MapResource[]> {
  const sc = stateCode.toLowerCase();

  // Check cache first
  const cached = registryCache.get(sc);
  if (cached && Date.now() - cached.ts < REGISTRY_CACHE_TTL) {
    return cached.data;
  }
   // Load geocode cache from DB if not already loaded
  await loadGeocodeLookup();
  const resources: MapResource[] = [];
  // T1a. Programs
  const programs = loadJSON<any>(join(statesDir, `${sc}_programs.json`));
  if (programs) {
    const progs = Array.isArray(programs) ? programs : programs.programs ?? [];
    for (const p of progs) {
      const region = p.region ?? "statewide";
      // Prefer street address geocoding over region centroid
      const geo = resolveGeo(stateCode, region, p);
      if (geo) {
        resources.push({
          type: "program",
          id: p.program_id ?? `${sc}_prog_${resources.length}`,
          name: p.program_name ?? p.name ?? "Unknown Program",
          stateCode: stateCode.toUpperCase(),
          region,
          lat: geo.lat,
          lng: geo.lng,
          category: p.benefit_category ?? p.category,
          phone: p.phone,
          website: p.website,
          agency: p.agency,
          ...(p.street_address ? { street_address: p.street_address } : {}),
          ...(p.city ? { city: p.city } : {}),
          ...(p.zip ? { zip: p.zip } : {}),
          geocodeSource: geo.source as any,
        });
      }
    }
  }

  // T1b. Oversight bodies
  const oversight = loadJSON<any>(join(statesDir, `${sc}_oversight.json`));
  if (oversight) {
    const chains = oversight.oversight_chains ?? [];
    for (const chain of chains) {
      const bodies = chain.bodies ?? [];
      for (const b of bodies) {
        const geo = resolveGeo(stateCode, "statewide", b);
        if (geo) {
          resources.push({
            type: "oversight",
            id: `${sc}_oversight_${resources.length}`,
            name: b.oversight_body ?? b.name ?? "Unknown Body",
            stateCode: stateCode.toUpperCase(),
            region: "statewide",
            lat: geo.lat,
            lng: geo.lng,
            phone: b.phone,
            website: b.complaint_portal,
            ...(b.street_address ? { street_address: b.street_address } : {}),
            ...(b.city ? { city: b.city } : {}),
            ...(b.zip ? { zip: b.zip } : {}),
            geocodeSource: geo.source as any,
          });
        }
      }
    }
  }

  // T1c. Tribal entities
  const tribal = loadJSON<any>(join(statesDir, `${sc}_tribal_overrides.json`));
  if (tribal) {
    const entities = tribal.tribal_entities ?? [];
    for (const e of entities) {
      const coverage = e.coverage ?? "statewide";
      const geo = resolveGeo(stateCode, coverage, e);
      if (geo) {
        resources.push({
          type: "tribal_entity",
          id: e.tribal_entity_id ?? `${sc}_tribal_${resources.length}`,
          name: e.tribal_entity_name ?? e.name ?? "Unknown Entity",
          stateCode: stateCode.toUpperCase(),
          region: coverage,
          lat: geo.lat,
          lng: geo.lng,
          phone: e.phone,
          website: e.portal,
          services: e.services,
          coverage: e.coverage,
          ...(e.street_address ? { street_address: e.street_address } : {}),
          ...(e.city ? { city: e.city } : {}),
          ...(e.zip ? { zip: e.zip } : {}),
          geocodeSource: geo.source as any,
        });
      }
    }
    const urbanPrograms = tribal.urban_indian_programs ?? [];
    for (const u of urbanPrograms) {
      const coverage = u.coverage ?? "statewide";
      const geo = resolveGeo(stateCode, coverage, u);
      if (geo) {
        resources.push({
          type: "urban_indian_program",
          id: u.program_id ?? `${sc}_urban_${resources.length}`,
          name: u.name ?? "Unknown Program",
          stateCode: stateCode.toUpperCase(),
          region: coverage,
          lat: geo.lat,
          lng: geo.lng,
          phone: u.phone,
          website: u.portal,
          services: u.services,
          coverage: u.coverage,
          ...(u.street_address ? { street_address: u.street_address } : {}),
          ...(u.city ? { city: u.city } : {}),
          ...(u.zip ? { zip: u.zip } : {}),
          geocodeSource: geo.source as any,
        });
      }
    }
  }

  // Cache the result
  registryCache.set(sc, { data: resources, ts: Date.now() });

  return resources;
}

/** Clear all caches — useful after registry compilation or data changes */
export function clearMapCaches() {
  registryCache.clear();
  mapLayersCache.clear();
}

// ─── Pattern Signal Clustering ───────────────────────────────────────

/**
 * Generate privacy-safe pattern signal clusters from pipeline activity.
 *
 * T4. Query pipeline_events grouped by (pipelineType, stateCode).
 * T5. Suppress any cluster with count < MIN_SIGNAL_COUNT.
 * T6. Apply coordinate jitter: offset the state centroid by ±JITTER_RADIUS
 *     so that the exact center is not revealed.
 * T7. Compute radius proportional to count (base 500m + 100m per event, capped at 5000m).
 */
function applyJitter(lat: number, lng: number): { lat: number; lng: number } {
  const jitterLat = (Math.random() - 0.5) * 2 * JITTER_RADIUS;
  const jitterLng = (Math.random() - 0.5) * 2 * JITTER_RADIUS;
  return {
    lat: Math.round((lat + jitterLat) * 10000) / 10000,
    lng: Math.round((lng + jitterLng) * 10000) / 10000,
  };
}

function computeRadius(count: number): number {
  // Base 500m + 100m per event, capped at 5000m
  return Math.min(500 + count * 100, 5000);
}

async function buildPatternSignals(opts: {
  stateCode?: string;
  signalWindowDays: number;
}): Promise<MapPatternSignal[]> {
  const since = Date.now() - opts.signalWindowDays * 24 * 60 * 60 * 1000;
  const counts = await db.getPipelineSignalCounts({
    stateCode: opts.stateCode,
    since,
  });

  const signals: MapPatternSignal[] = [];
  for (const row of counts) {
    // T5. Privacy threshold
    if (row.count < MIN_SIGNAL_COUNT) continue;
    if (!row.stateCode) continue;

    const centroid = getStateCentroid(row.stateCode);
    if (!centroid) continue;

    // T6. Jitter
    const jittered = applyJitter(centroid.lat, centroid.lng);

    signals.push({
      type: "pattern_signal",
      pipeline: row.pipelineType,
      stateCode: row.stateCode,
      lat: jittered.lat,
      lng: jittered.lng,
      count: row.count,
      radius: computeRadius(row.count),
    });
  }

  return signals;
}

// ─── Main Aggregation Function ───────────────────────────────────────

export async function buildMapLayers(opts: {
  stateCode?: string;
  signalWindowDays: number;
}): Promise<MapLayersResponse> {
  // Check full-response cache
  const cacheKey = opts.stateCode ?? "__all__";
  const cached = mapLayersCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MAP_LAYERS_CACHE_TTL) {
    return cached.data;
  }

  // Determine which states to load
  let stateCodes: string[];
  if (opts.stateCode) {
    stateCodes = [opts.stateCode.toUpperCase()];
  } else {
    // Load all states that have config files
    try {
      const files = readdirSync(statesDir).filter(f => f.endsWith("_manifest.json"));
      stateCodes = files.map(f => f.replace("_manifest.json", "").toUpperCase());
    } catch {
      stateCodes = [];
    }
  }

  // T1-T2. Registry resources
  const resources: MapResource[] = [];
  for (const sc of stateCodes) {
    resources.push(...(await extractRegistryResources(sc)));
  }

  // T3. Lighthouse items from database
  const [jobs, posts, events] = await Promise.all([
    db.getGeocodedJobs(opts.stateCode),
    db.getGeocodedPosts(opts.stateCode),
    db.getGeocodedEvents(opts.stateCode),
  ]);

  const mapJobs: MapJob[] = jobs.map(j => ({ type: "job" as const, ...j }));
  const mapPosts: MapPost[] = posts.map(p => ({ type: "post" as const, ...p }));

  // Split events into workshops and tribal_events
  const workshops: MapWorkshop[] = [];
  const tribalEvents: MapWorkshop[] = [];
  for (const e of events) {
    const item: MapWorkshop = {
      type: e.eventType as MapWorkshop["type"],
      id: e.id,
      title: e.title,
      organization: e.organization,
      location: e.location,
      stateCode: e.stateCode,
      lat: e.lat,
      lng: e.lng,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      url: e.url,
    };
    if (e.eventType === "tribal_gathering") {
      tribalEvents.push(item);
    } else {
      workshops.push(item);
    }
  }

  // T4-T7. Pattern signals
  const patternSignals = await buildPatternSignals(opts);

  const result: MapLayersResponse = {
    resources,
    jobs: mapJobs,
    posts: mapPosts,
    workshops,
    tribal_events: tribalEvents,
    pattern_signals: patternSignals,
    meta: {
      states_loaded: stateCodes,
      total_resources: resources.length,
      total_jobs: mapJobs.length,
      total_posts: mapPosts.length,
      total_workshops: workshops.length,
      total_tribal_events: tribalEvents.length,
      total_pattern_signals: patternSignals.length,
      signal_window_days: opts.signalWindowDays,
      privacy_threshold: MIN_SIGNAL_COUNT,
    },
  };

  // Store in cache
  mapLayersCache.set(cacheKey, { data: result, ts: Date.now() });

  return result;
}
