/**
 * Map-Based Intake Flow — Geographic Entry Point for the Pipeline Engine
 *
 * T1. User clicks a map pin or location
 * T2. Detect state from coordinates (nearest state centroid)
 * T3. Gather nearby resources within radius
 * T4. Gather nearby aggregated pattern signals (privacy-safe)
 * T5. Suggest pipelines based on geographic context + signal density
 * T6. Partition resources into programs vs oversight for navigator prefill
 * T7. Create a persistent session for the intake flow
 */

import { STATE_CENTROIDS } from "./geocoding";
import { buildMapLayers, type MapResource, type MapPatternSignal } from "./civic-map";
import { autoDetect, buildSignalProfiles, type PipelineSuggestion } from "./intake-autodetect";

// ─── Geographic Context Detection ───────────────────────────────────

/** Haversine distance in km */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** State bounding boxes for fast detection (approximate) */
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  AZ: { minLat: 31.33, maxLat: 37.00, minLng: -114.81, maxLng: -109.04 },
  CA: { minLat: 32.53, maxLat: 42.01, minLng: -124.48, maxLng: -114.13 },
  FL: { minLat: 24.40, maxLat: 31.00, minLng: -87.63, maxLng: -80.03 },
  IL: { minLat: 36.97, maxLat: 42.51, minLng: -91.51, maxLng: -87.02 },
  MO: { minLat: 35.99, maxLat: 40.61, minLng: -95.77, maxLng: -89.10 },
  NY: { minLat: 40.50, maxLat: 45.01, minLng: -79.76, maxLng: -71.86 },
  OH: { minLat: 38.40, maxLat: 41.98, minLng: -84.82, maxLng: -80.52 },
  OR: { minLat: 41.99, maxLat: 46.29, minLng: -124.57, maxLng: -116.46 },
  PA: { minLat: 39.72, maxLat: 42.27, minLng: -80.52, maxLng: -74.69 },
  TX: { minLat: 25.84, maxLat: 36.50, minLng: -106.65, maxLng: -93.51 },
  WA: { minLat: 45.54, maxLat: 49.00, minLng: -124.85, maxLng: -116.92 },
};

/**
 * T2. Detect state from coordinates.
 * First checks bounding boxes, then falls back to nearest centroid.
 */
export function detectStateFromCoordinates(lat: number, lng: number): string | null {
  // Phase 1: Check bounding boxes
  const candidates: string[] = [];
  for (const [state, bounds] of Object.entries(STATE_BOUNDS)) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat &&
        lng >= bounds.minLng && lng <= bounds.maxLng) {
      candidates.push(state);
    }
  }
  if (candidates.length === 1) return candidates[0];

  // Phase 2: If multiple candidates or none, use nearest centroid
  // Only consider active states (those with registry configs)
  const activeStates = Object.keys(STATE_BOUNDS);
  let nearest: string | null = null;
  let minDist = Infinity;
  const searchSet = candidates.length > 0 ? candidates : activeStates;
  for (const state of searchSet) {
    const centroid = STATE_CENTROIDS[state];
    if (!centroid) continue;
    const d = haversine(lat, lng, centroid.lat, centroid.lng);
    if (d < minDist) {
      minDist = d;
      nearest = state;
    }
  }
  // Only return if within reasonable distance (500km)
  return nearest && minDist < 500 ? nearest : null;
}

// ─── Nearby Resource Discovery ──────────────────────────────────────

export interface NearbyResourceSummary {
  id: string;
  name: string;
  type: string;
  category?: string;
  phone?: string;
  website?: string;
  distanceKm: number;
}

export interface NearbySignalSummary {
  pipeline: string;
  count: number;
}

/**
 * T3. Gather nearby resources within radius.
 * Returns resources sorted by distance, with distance computed.
 */
export async function findNearbyResources(
  lat: number,
  lng: number,
  radiusKm: number,
  stateCode?: string,
): Promise<NearbyResourceSummary[]> {
  const layers = await buildMapLayers({ signalWindowDays: 90, stateCode });
  const nearby: NearbyResourceSummary[] = [];

  for (const r of layers.resources) {
    const d = haversine(lat, lng, r.lat, r.lng);
    if (d <= radiusKm) {
      nearby.push({
        id: r.id,
        name: r.name,
        type: r.type,
        category: r.category,
        phone: r.phone,
        website: r.website,
        distanceKm: Math.round(d * 10) / 10,
      });
    }
  }

  nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  return nearby;
}

/**
 * T4. Gather nearby aggregated pattern signals.
 * Privacy-safe: only returns pipeline + count, no individual case data.
 */
export async function findNearbySignals(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<NearbySignalSummary[]> {
  const layers = await buildMapLayers({ signalWindowDays: 90 });
  const nearby: NearbySignalSummary[] = [];

  for (const s of layers.pattern_signals) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d <= radiusKm) {
      nearby.push({
        pipeline: s.pipeline,
        count: s.count,
      });
    }
  }

  // Aggregate by pipeline type
  const aggregated = new Map<string, number>();
  for (const s of nearby) {
    aggregated.set(s.pipeline, (aggregated.get(s.pipeline) || 0) + s.count);
  }

  return Array.from(aggregated.entries())
    .map(([pipeline, count]) => ({ pipeline, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Pipeline Suggestion Logic ──────────────────────────────────────

/** The four primary pipelines suggested from map-based intake */
export const MAP_INTAKE_PIPELINES = [
  "tenant_rights",           // housing_violation equivalent (most common housing pipeline)
  "wage_theft",              // employment wage theft
  "benefits_denial",         // benefits denial
  "health_insurance_denial", // insurance denial
] as const;

/** Additional pipelines that can be suggested based on geographic signals */
const SIGNAL_PIPELINE_BOOST: Record<string, string[]> = {
  housing: ["tenant_rights", "eviction_defense", "housing_discrimination", "section8_disputes"],
  employment: ["wage_theft", "workers_compensation", "employment_discrimination"],
  benefits: ["benefits_denial", "snap_denial", "public_assistance_dispute"],
  insurance: ["health_insurance_denial", "disability_claim_denial", "insurance_claim_denial"],
  tribal: ["tribal_housing", "icwa_compliance", "tribal_jurisdiction"],
  family: ["domestic_violence", "custody_dispute", "child_welfare"],
  immigration: ["immigration_case", "asylum_claim", "work_authorization_dispute"],
};

export interface MapIntakeSuggestion {
  pipeline_id: string;
  label: string;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  match_reasons: string[];
  source: "geographic" | "signal" | "default";
}

/**
 * T5. Suggest pipelines based on geographic context and signal density.
 *
 * Strategy:
 * 1. Start with the 4 default pipelines at baseline confidence
 * 2. Boost pipelines that match nearby resource categories
 * 3. Boost pipelines that match nearby pattern signals
 * 4. Add additional pipelines if strong signal presence
 * 5. Sort by confidence, return top suggestions
 */
export function suggestPipelines(
  nearbyResources: NearbyResourceSummary[],
  nearbySignals: NearbySignalSummary[],
  detectedState: string | null,
): MapIntakeSuggestion[] {
  const profiles = buildSignalProfiles();
  const scores = new Map<string, { score: number; reasons: string[]; source: "geographic" | "signal" | "default" }>();

  // Phase 1: Baseline — add the 4 default pipelines
  for (const pid of MAP_INTAKE_PIPELINES) {
    scores.set(pid, { score: 0.3, reasons: ["Default pipeline for map-based intake"], source: "default" });
  }

  // Phase 2: Boost from nearby resource categories
  const categoryCounts = new Map<string, number>();
  for (const r of nearbyResources) {
    if (r.category) {
      categoryCounts.set(r.category, (categoryCounts.get(r.category) || 0) + 1);
    }
  }

  // Map resource categories to pipeline categories
  const CATEGORY_TO_PIPELINE_CAT: Record<string, string> = {
    housing: "housing",
    dv_safety: "family",
    domestic_violence: "family",
    legal_aid: "general",
    food: "benefits",
    food_assistance: "benefits",
    cash_assistance: "benefits",
    healthcare: "insurance",
    disability: "benefits",
    immigration: "immigration",
    tribal_indigenous: "tribal",
    utilities: "housing",
    community_navigation: "general",
    crisis_hotline: "general",
    family_services: "family",
    lgbtq: "lgbtq_rights",
    general_assistance: "benefits",
  };

  for (const [cat, count] of categoryCounts) {
    const pipelineCat = CATEGORY_TO_PIPELINE_CAT[cat];
    if (!pipelineCat) continue;
    const boostPipelines = SIGNAL_PIPELINE_BOOST[pipelineCat] || [];
    const boost = Math.min(count * 0.1, 0.3); // cap at 0.3 boost

    for (const pid of boostPipelines) {
      const existing = scores.get(pid);
      if (existing) {
        existing.score += boost;
        existing.reasons.push(`${count} nearby ${cat} resource${count > 1 ? "s" : ""}`);
        existing.source = "geographic";
      } else {
        scores.set(pid, {
          score: 0.15 + boost,
          reasons: [`${count} nearby ${cat} resource${count > 1 ? "s" : ""}`],
          source: "geographic",
        });
      }
    }
  }

  // Phase 3: Boost from pattern signals
  for (const signal of nearbySignals) {
    const existing = scores.get(signal.pipeline);
    const signalBoost = Math.min(signal.count * 0.05, 0.4);
    if (existing) {
      existing.score += signalBoost;
      existing.reasons.push(`${signal.count} pattern signal${signal.count > 1 ? "s" : ""} in area`);
      existing.source = "signal";
    } else {
      scores.set(signal.pipeline, {
        score: 0.1 + signalBoost,
        reasons: [`${signal.count} pattern signal${signal.count > 1 ? "s" : ""} in area`],
        source: "signal",
      });
    }
  }

  // Phase 4: Build suggestions with profile labels
  const suggestions: MapIntakeSuggestion[] = [];
  for (const [pid, data] of scores) {
    const profile = profiles.get(pid);
    if (!profile) continue;

    const confidence = Math.min(data.score, 1.0);
    const confidenceLabel: "high" | "medium" | "low" =
      confidence >= 0.6 ? "high" :
      confidence >= 0.35 ? "medium" : "low";

    suggestions.push({
      pipeline_id: pid,
      label: profile.label,
      confidence: Math.round(confidence * 100) / 100,
      confidence_label: confidenceLabel,
      match_reasons: data.reasons,
      source: data.source,
    });
  }

  // Sort by confidence descending, limit to 8
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 8);
}

// ─── Resource Partitioning ──────────────────────────────────────────

export interface ProgramSummary {
  id: string;
  name: string;
  category?: string;
  phone?: string;
  website?: string;
}

export interface OversightSummary {
  id: string;
  name: string;
  agency?: string;
  phone?: string;
  website?: string;
}

/**
 * T6. Partition nearby resources into programs and oversight bodies.
 * Used to pre-populate the intake navigator.
 */
export function partitionResources(
  nearbyResources: NearbyResourceSummary[],
): { programs: ProgramSummary[]; oversight: OversightSummary[] } {
  const programs: ProgramSummary[] = [];
  const oversight: OversightSummary[] = [];

  for (const r of nearbyResources) {
    if (r.type === "oversight") {
      oversight.push({
        id: r.id,
        name: r.name,
        agency: r.category,
        phone: r.phone,
        website: r.website,
      });
    } else {
      // program, tribal_entity, urban_indian_program → all go to programs
      programs.push({
        id: r.id,
        name: r.name,
        category: r.category,
        phone: r.phone,
        website: r.website,
      });
    }
  }

  return { programs, oversight };
}

// ─── Full Intake Context Builder ────────────────────────────────────

export interface MapIntakeContext {
  lat: number;
  lng: number;
  detectedState: string | null;
  detectedRegion: string | null;
  nearbyResources: NearbyResourceSummary[];
  patternSignals: NearbySignalSummary[];
  suggestedPipelines: MapIntakeSuggestion[];
  nearestPrograms: ProgramSummary[];
  nearestOversight: OversightSummary[];
  radiusKm: number;
}

/**
 * T7. Build the full intake context from a map click.
 * This is the main entry point for the map-based intake flow.
 */
export async function buildMapIntakeContext(
  lat: number,
  lng: number,
  radiusKm: number = 50,
): Promise<MapIntakeContext> {
  // T2. Detect state
  const detectedState = detectStateFromCoordinates(lat, lng);

  // T3. Nearby resources
  const nearbyResources = await findNearbyResources(lat, lng, radiusKm, detectedState ?? undefined);

  // T4. Nearby signals (aggregated, privacy-safe)
  const patternSignals = await findNearbySignals(lat, lng, radiusKm);

  // T5. Pipeline suggestions
  const suggestedPipelines = suggestPipelines(nearbyResources, patternSignals, detectedState);

  // T6. Partition resources
  const { programs, oversight } = partitionResources(nearbyResources);

  // Detect region from nearest resource city
  let detectedRegion: string | null = null;
  if (nearbyResources.length > 0) {
    // Use the nearest resource's name as a proxy for region
    const nearest = nearbyResources[0];
    detectedRegion = nearest.category
      ? `${nearest.category} services area`
      : null;
  }

  return {
    lat,
    lng,
    detectedState,
    detectedRegion,
    nearbyResources,
    patternSignals,
    suggestedPipelines,
    nearestPrograms: programs,
    nearestOversight: oversight,
    radiusKm,
  };
}
