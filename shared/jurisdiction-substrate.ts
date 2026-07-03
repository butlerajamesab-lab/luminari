/**
 * Integration-safe jurisdiction substrate types and small deterministic helpers.
 *
 * This module does not declare a new canonical jurisdiction table. Canonical
 * identity is represented as a `(refTable, refId)` pair so current Lighthouse
 * tables and Atlas bridge projections can remain authoritative until an ADR-led
 * migration replaces them.
 */

export const JURISDICTION_TYPES = [
  "federal",
  "state",
  "district_of_columbia",
  "territory",
  "tribal",
  "county",
  "municipal",
  "regional",
  "interstate",
  "federal_circuit",
  "administrative_region",
  "unknown",
  "mixed",
] as const;

export type JurisdictionType = (typeof JURISDICTION_TYPES)[number];

export const LEGACY_JURISDICTION_TYPE_MAP = {
  city: "municipal",
  municipal: "municipal",
  county: "county",
  state: "state",
  federal: "federal",
  tribal: "tribal",
  territory: "territory",
} as const satisfies Record<string, JurisdictionType>;

export const COVERAGE_STATES = [
  "covered",
  "partially_covered",
  "staged_not_promoted",
  "candidate_only",
  "known_gap",
  "source_missing",
  "unknown",
  "not_applicable",
  "needs_review",
] as const;

export type CoverageState = (typeof COVERAGE_STATES)[number];

export const PROMOTION_STATUSES = [
  "queued",
  "audited",
  "needs_transform",
  "candidate",
  "review_required",
  "approved",
  "promoted",
  "rejected",
  "duplicate_risk",
  "parse_error",
  "unknown",
  "superseded",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type ReviewStatus = PromotionStatus;

export const JURISDICTION_RELATIONSHIP_TYPES = [
  "located_in",
  "contains",
  "overlaps",
  "administered_by",
  "enforced_by",
  "appeal_to",
  "venue_for",
  "service_area",
  "funded_by",
  "regulated_by",
  "delegated_to",
  "compact_with",
  "preempted_by",
  "concurrent_with",
  "exclusive_authority",
  "referral_to",
  "oversight_by",
  "reviewed_by",
] as const;

export type JurisdictionRelationshipType = (typeof JURISDICTION_RELATIONSHIP_TYPES)[number];

export const JURISDICTION_ALIAS_TYPES = [
  "registry_id",
  "legacy_id",
  "state_code",
  "territory_code",
  "fips",
  "county_fips",
  "census_geoid",
  "gnis",
  "bia_identifier",
  "openstates_id",
  "court_identifier",
  "display_name",
  "alternate_name",
  "slug",
] as const;

export type JurisdictionAliasType = (typeof JURISDICTION_ALIAS_TYPES)[number];

export const US_STATES = [
  { name: "Alabama", code: "AL" },
  { name: "Alaska", code: "AK" },
  { name: "Arizona", code: "AZ" },
  { name: "Arkansas", code: "AR" },
  { name: "California", code: "CA" },
  { name: "Colorado", code: "CO" },
  { name: "Connecticut", code: "CT" },
  { name: "Delaware", code: "DE" },
  { name: "Florida", code: "FL" },
  { name: "Georgia", code: "GA" },
  { name: "Hawaii", code: "HI" },
  { name: "Idaho", code: "ID" },
  { name: "Illinois", code: "IL" },
  { name: "Indiana", code: "IN" },
  { name: "Iowa", code: "IA" },
  { name: "Kansas", code: "KS" },
  { name: "Kentucky", code: "KY" },
  { name: "Louisiana", code: "LA" },
  { name: "Maine", code: "ME" },
  { name: "Maryland", code: "MD" },
  { name: "Massachusetts", code: "MA" },
  { name: "Michigan", code: "MI" },
  { name: "Minnesota", code: "MN" },
  { name: "Mississippi", code: "MS" },
  { name: "Missouri", code: "MO" },
  { name: "Montana", code: "MT" },
  { name: "Nebraska", code: "NE" },
  { name: "Nevada", code: "NV" },
  { name: "New Hampshire", code: "NH" },
  { name: "New Jersey", code: "NJ" },
  { name: "New Mexico", code: "NM" },
  { name: "New York", code: "NY" },
  { name: "North Carolina", code: "NC" },
  { name: "North Dakota", code: "ND" },
  { name: "Ohio", code: "OH" },
  { name: "Oklahoma", code: "OK" },
  { name: "Oregon", code: "OR" },
  { name: "Pennsylvania", code: "PA" },
  { name: "Rhode Island", code: "RI" },
  { name: "South Carolina", code: "SC" },
  { name: "South Dakota", code: "SD" },
  { name: "Tennessee", code: "TN" },
  { name: "Texas", code: "TX" },
  { name: "Utah", code: "UT" },
  { name: "Vermont", code: "VT" },
  { name: "Virginia", code: "VA" },
  { name: "Washington", code: "WA" },
  { name: "West Virginia", code: "WV" },
  { name: "Wisconsin", code: "WI" },
  { name: "Wyoming", code: "WY" },
] as const;

export const DISTRICT_OF_COLUMBIA = { name: "District of Columbia", code: "DC" } as const;

export const US_TERRITORIES = [
  { name: "Puerto Rico", code: "PR" },
  { name: "Guam", code: "GU" },
  { name: "U.S. Virgin Islands", code: "VI" },
  { name: "American Samoa", code: "AS" },
  { name: "Northern Mariana Islands", code: "MP" },
] as const;

export const NATIONWIDE_DOMAINS = [
  "civil_rights",
  "housing",
  "employment",
  "labor",
  "wages",
  "benefits",
  "healthcare",
  "insurance",
  "consumer_protection",
  "family_law",
  "child_welfare",
  "domestic_violence",
  "criminal_justice",
  "reentry",
  "immigration",
  "disability_rights",
  "education",
  "elder_care",
  "veterans",
  "tribal_rights",
  "foia_public_records",
  "environmental_justice",
  "mental_health",
  "substance_use",
  "homelessness",
  "legal_aid",
  "court_access",
  "public_defense",
  "oversight_accountability",
  "legislative_reform_pathways",
] as const;

export const RUNTIME_SURFACES = [
  "legal_library",
  "doctrine_graph",
  "civic_map",
  "benefits_navigator",
  "enforcement_pathway",
  "deadline_calculator",
  "civil_gideon",
  "resource_directory",
  "filing_generator",
  "mission_control",
  "sovereign_control_admin",
] as const;

export const PIPELINE_CONTEXTS = [
  "staged",
  "candidate",
  "canonical",
  "queue",
  "backlog",
  "review",
  "promotion_batch",
  "complete_export",
] as const;

export type PipelineContext = (typeof PIPELINE_CONTEXTS)[number];

export type CanonicalJurisdictionRef = {
  jurisdictionRefTable: "jurisdictions" | "registry_jurisdictions" | "jurisdiction_hierarchy" | "atlas_bridge" | string;
  jurisdictionRefId: string;
};

export type TribalJurisdictionMetadata = {
  tribalNation?: string | null;
  federalRecognitionStatus?: string | null;
  sourceAuthority?: string | null;
  tribalGovernmentName?: string | null;
  tribalCourtName?: string | null;
  reservationOrServiceArea?: string | null;
  stateOverlap?: string[] | null;
  federalAgencyOverlap?: string[] | null;
  biaOverlap?: string[] | null;
  ihsOverlap?: string[] | null;
  bieOverlap?: string[] | null;
  icwaRelevance?: string | null;
  publicLaw280Relevance?: string | null;
  treatyReservedRightsReference?: string | null;
};

export type ServiceAreaMetadata = {
  countyFips?: string | null;
  censusGeoid?: string | null;
  serviceAreaGeometryRef?: string | null;
  regionalServiceArea?: string | null;
  legalAidServiceArea?: string | null;
  tribalServiceArea?: string | null;
  distanceTravelBarrierFlags?: string[] | null;
  remotePhoneOnlineIntake?: Array<"remote" | "phone" | "online" | "in_person_only"> | null;
  ruralFrontierClassification?: string | null;
};

export type JurisdictionAssertionDraft = TribalJurisdictionMetadata & ServiceAreaMetadata & {
  sourceTable: string;
  sourceRecordId: string;
  sourceName?: string | null;
  sourceHash?: string | null;
  candidateRecordId?: string | null;
  canonicalRecordId?: string | null;
  jurisdictionRefTable?: string | null;
  jurisdictionRefId?: string | null;
  jurisdictionType: JurisdictionType;
  jurisdictionLabel?: string | null;
  jurisdictionCode?: string | null;
  relationshipType: JurisdictionRelationshipType;
  confidence: number;
  evidenceBasis: string;
  createdFromRule: string;
  reviewStatus: ReviewStatus;
  promotionStatus: PromotionStatus;
  supersedesId?: string | null;
  isActive: boolean;
};

export type JurisdictionAlias = CanonicalJurisdictionRef & {
  id: string;
  aliasType: JurisdictionAliasType;
  aliasValue: string;
  sourceSystem: string;
  confidence: number;
  validFrom?: string | null;
  validTo?: string | null;
  isActive: boolean;
};

export type JurisdictionCoverageRun = {
  id: string;
  runKey: string;
  reportKind: string;
  scope: string;
  sourceInventoryHash: string;
  generatedAt: string;
  generatedBy: string;
  notes?: string | null;
};

export type JurisdictionCoverageItem = CanonicalJurisdictionRef & {
  id: string;
  runId: string;
  jurisdictionType: JurisdictionType;
  domain?: string | null;
  runtimeSurface?: string | null;
  pipelineContext?: PipelineContext | string | null;
  coverageState: CoverageState;
  expectedCount: number;
  stagedCount: number;
  candidateCount: number;
  promotedCount: number;
  verifiedCount: number;
  gapCount: number;
  confidence?: number | null;
  freshnessStatus?: string | null;
  gapReason?: string | null;
  nextAction?: string | null;
};

export type JurisdictionOverlapAssertion = {
  id: string;
  fromJurisdictionRefTable: string;
  fromJurisdictionRefId: string;
  toJurisdictionRefTable: string;
  toJurisdictionRefId: string;
  relationshipType: JurisdictionRelationshipType;
  legalBasis?: string | null;
  evidenceBasis?: string | null;
  confidence?: number | null;
  reviewStatus: ReviewStatus;
  isActive: boolean;
  validFrom?: string | null;
  validTo?: string | null;
};

export type JurisdictionMetadataGap = {
  id: string;
  sourceTable: string;
  sourceRecordId: string;
  missingField: string;
  jurisdictionHint?: string | null;
  gapReason: string;
  severity: "low" | "medium" | "high" | "critical";
  pipelineContext?: PipelineContext | string | null;
  runtimeSurface?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
};

export type JurisdictionSourceInput = {
  sourceTable: string;
  sourceRecordId: string;
  sourceName?: string | null;
  sourceHash?: string | null;
  candidateRecordId?: string | null;
  canonicalRecordId?: string | null;
  knownJurisdictionRefs?: Array<CanonicalJurisdictionRef & { type: JurisdictionType; label?: string; code?: string }>;
  stateCode?: string | null;
  state?: string | null;
  territoryCode?: string | null;
  territory?: string | null;
  districtOfColumbia?: boolean | null;
  tribal?: TribalJurisdictionMetadata | null;
  county?: string | null;
  countyFips?: string | null;
  municipality?: string | null;
  municipalCode?: string | null;
  serviceArea?: ServiceAreaMetadata | null;
  jurisdictionalText?: string | null;
  arbitraryText?: string | null;
};

const stateByCode = new Map<string, (typeof US_STATES)[number]>(US_STATES.map((state) => [state.code, state]));
const stateByName = new Map<string, (typeof US_STATES)[number]>(US_STATES.map((state) => [state.name.toLowerCase(), state]));
const territoryByCode = new Map<string, (typeof US_TERRITORIES)[number]>(US_TERRITORIES.map((territory) => [territory.code, territory]));
const territoryByName = new Map<string, (typeof US_TERRITORIES)[number]>(US_TERRITORIES.map((territory) => [territory.name.toLowerCase(), territory]));

export function normalizeJurisdictionType(input: string | null | undefined): JurisdictionType {
  if (!input) return "unknown";
  return LEGACY_JURISDICTION_TYPE_MAP[input.toLowerCase() as keyof typeof LEGACY_JURISDICTION_TYPE_MAP] ??
    (JURISDICTION_TYPES.includes(input as JurisdictionType) ? input as JurisdictionType : "unknown");
}

function baseAssertion(input: JurisdictionSourceInput, overrides: Partial<JurisdictionAssertionDraft> & Pick<JurisdictionAssertionDraft, "jurisdictionType" | "relationshipType" | "evidenceBasis" | "createdFromRule">): JurisdictionAssertionDraft {
  return {
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    sourceName: input.sourceName ?? null,
    sourceHash: input.sourceHash ?? null,
    candidateRecordId: input.candidateRecordId ?? null,
    canonicalRecordId: input.canonicalRecordId ?? null,
    confidence: 0.5,
    reviewStatus: "candidate",
    promotionStatus: "candidate",
    isActive: true,
    ...input.serviceArea,
    ...overrides,
  };
}

export function buildJurisdictionAssertionsFromSource(input: JurisdictionSourceInput): JurisdictionAssertionDraft[] {
  const assertions: JurisdictionAssertionDraft[] = [];

  for (const ref of input.knownJurisdictionRefs ?? []) {
    assertions.push(baseAssertion(input, {
      jurisdictionRefTable: ref.jurisdictionRefTable,
      jurisdictionRefId: ref.jurisdictionRefId,
      jurisdictionType: ref.type,
      jurisdictionLabel: ref.label ?? null,
      jurisdictionCode: ref.code ?? null,
      relationshipType: "located_in",
      confidence: 0.98,
      evidenceBasis: `Known jurisdiction reference ${ref.jurisdictionRefTable}:${ref.jurisdictionRefId}`,
      createdFromRule: "known_jurisdiction_ref",
    }));
  }

  if (input.districtOfColumbia) {
    assertions.push(baseAssertion(input, {
      jurisdictionRefTable: "registry_jurisdictions",
      jurisdictionRefId: "j_washington_dc",
      jurisdictionType: "district_of_columbia",
      jurisdictionLabel: DISTRICT_OF_COLUMBIA.name,
      jurisdictionCode: DISTRICT_OF_COLUMBIA.code,
      relationshipType: "located_in",
      confidence: 0.95,
      evidenceBasis: "Explicit District of Columbia field",
      createdFromRule: "explicit_dc_field",
    }));
  }

  const state = input.stateCode ? stateByCode.get(input.stateCode.toUpperCase()) : input.state ? stateByName.get(input.state.toLowerCase()) : undefined;
  if (state) {
    assertions.push(baseAssertion(input, {
      jurisdictionRefTable: "registry_jurisdictions",
      jurisdictionRefId: `j_${state.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      jurisdictionType: "state",
      jurisdictionLabel: state.name,
      jurisdictionCode: state.code,
      relationshipType: "located_in",
      confidence: input.stateCode ? 0.93 : 0.88,
      evidenceBasis: input.stateCode ? "Explicit state_code field" : "Explicit state field",
      createdFromRule: "explicit_state_field",
    }));
  }

  const territory = input.territoryCode ? territoryByCode.get(input.territoryCode.toUpperCase()) : input.territory ? territoryByName.get(input.territory.toLowerCase()) : undefined;
  if (territory) {
    assertions.push(baseAssertion(input, {
      jurisdictionRefTable: "registry_jurisdictions",
      jurisdictionRefId: `j_${territory.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      jurisdictionType: "territory",
      jurisdictionLabel: territory.name,
      jurisdictionCode: territory.code,
      relationshipType: "located_in",
      confidence: input.territoryCode ? 0.93 : 0.88,
      evidenceBasis: input.territoryCode ? "Explicit territory_code field" : "Explicit territory field",
      createdFromRule: "explicit_territory_field",
    }));
  }

  if (input.tribal?.tribalNation || input.tribal?.tribalGovernmentName || input.tribal?.tribalCourtName) {
    assertions.push(baseAssertion(input, {
      ...input.tribal,
      jurisdictionType: "tribal",
      jurisdictionLabel: input.tribal.tribalNation ?? input.tribal.tribalGovernmentName ?? input.tribal.tribalCourtName ?? null,
      relationshipType: "overlaps",
      confidence: 0.86,
      evidenceBasis: "Explicit tribal jurisdiction field",
      createdFromRule: "explicit_tribal_field",
      reviewStatus: "review_required",
      promotionStatus: "review_required",
    }));
  }

  if (input.county || input.countyFips) {
    assertions.push(baseAssertion(input, {
      jurisdictionType: "county",
      jurisdictionLabel: input.county ?? null,
      jurisdictionCode: input.countyFips ?? null,
      countyFips: input.countyFips ?? null,
      relationshipType: "service_area",
      confidence: input.countyFips ? 0.84 : 0.72,
      evidenceBasis: input.countyFips ? "Explicit county_fips field" : "Explicit county field",
      createdFromRule: "explicit_county_field",
    }));
  }

  if (input.municipality || input.municipalCode) {
    assertions.push(baseAssertion(input, {
      jurisdictionType: "municipal",
      jurisdictionLabel: input.municipality ?? null,
      jurisdictionCode: input.municipalCode ?? null,
      relationshipType: "service_area",
      confidence: input.municipalCode ? 0.82 : 0.7,
      evidenceBasis: input.municipalCode ? "Explicit municipal_code field" : "Explicit municipality field",
      createdFromRule: "explicit_municipal_field",
    }));
  }

  if (input.jurisdictionalText) {
    const lower = input.jurisdictionalText.toLowerCase();
    if (/\b(united states|federal|u\.s\.|usa|national)\b/i.test(input.jurisdictionalText)) {
      assertions.push(baseAssertion(input, {
        jurisdictionRefTable: "registry_jurisdictions",
        jurisdictionRefId: "j_federal",
        jurisdictionType: "federal",
        jurisdictionLabel: "United States",
        jurisdictionCode: "US",
        relationshipType: "administered_by",
        confidence: 0.62,
        evidenceBasis: "Controlled jurisdictional text mentions federal authority",
        createdFromRule: "controlled_text_federal",
        reviewStatus: "review_required",
        promotionStatus: "review_required",
      }));
    }
    for (const stateCandidate of US_STATES) {
      if (lower.includes(stateCandidate.name.toLowerCase())) {
        assertions.push(baseAssertion(input, {
          jurisdictionRefTable: "registry_jurisdictions",
          jurisdictionRefId: `j_${stateCandidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
          jurisdictionType: "state",
          jurisdictionLabel: stateCandidate.name,
          jurisdictionCode: stateCandidate.code,
          relationshipType: "overlaps",
          confidence: 0.58,
          evidenceBasis: "Controlled jurisdictional text names state",
          createdFromRule: "controlled_text_state_name",
          reviewStatus: "review_required",
          promotionStatus: "review_required",
        }));
      }
    }
    if (/\b(tribe|tribal|nation|reservation|icwa|bia|ihs|bie|indian country)\b/i.test(input.jurisdictionalText)) {
      assertions.push(baseAssertion(input, {
        jurisdictionType: "tribal",
        jurisdictionLabel: input.tribal?.tribalNation ?? null,
        relationshipType: "overlaps",
        confidence: 0.52,
        evidenceBasis: "Controlled jurisdictional text contains tribal authority indicator",
        createdFromRule: "controlled_text_tribal_indicator",
        reviewStatus: "review_required",
        promotionStatus: "review_required",
      }));
    }
  }

  if (assertions.length === 0) {
    assertions.push(baseAssertion(input, {
      jurisdictionType: "unknown",
      relationshipType: "overlaps",
      confidence: 0,
      evidenceBasis: "No structured jurisdiction fields or controlled jurisdictional text resolved",
      createdFromRule: "fallback_unknown",
      reviewStatus: "unknown",
      promotionStatus: "unknown",
    }));
  }

  return assertions;
}

export function buildMetadataGaps(input: JurisdictionSourceInput, assertions: JurisdictionAssertionDraft[]): Omit<JurisdictionMetadataGap, "id" | "createdAt">[] {
  const hasUnknown = assertions.some((assertion) => assertion.jurisdictionType === "unknown");
  if (!hasUnknown) return [];
  return [{
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    missingField: "jurisdiction_ref",
    jurisdictionHint: input.jurisdictionalText ?? input.arbitraryText ?? null,
    gapReason: "No structured jurisdiction identity resolved",
    severity: "high",
    pipelineContext: "candidate",
    runtimeSurface: null,
    resolvedAt: null,
    resolutionNotes: null,
  }];
}

export function stableInventoryHash(value: unknown): string {
  const stable = JSON.stringify(sortForHash(value));
  let hash = 5381;
  for (let i = 0; i < stable.length; i++) hash = ((hash << 5) + hash) ^ stable.charCodeAt(i);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortForHash(nested)]));
  }
  return value;
}

export function createCoverageRun(input: Omit<JurisdictionCoverageRun, "id" | "runKey" | "sourceInventoryHash"> & { sourceInventory: unknown }): JurisdictionCoverageRun {
  const sourceInventoryHash = stableInventoryHash(input.sourceInventory);
  return {
    id: `${input.reportKind}:${input.scope}:${sourceInventoryHash}`,
    runKey: `${input.reportKind}:${input.scope}:${sourceInventoryHash}`,
    reportKind: input.reportKind,
    scope: input.scope,
    sourceInventoryHash,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    notes: input.notes ?? null,
  };
}

export function createCursorPage<T>(itemsFetchedForPage: T[], cursor: string | null, limit: number): { items: T[]; nextCursor: string | null } {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const safeLimit = Math.max(1, limit);
  const items = itemsFetchedForPage.slice(0, safeLimit);
  const hasMore = itemsFetchedForPage.length > safeLimit;
  return { items, nextCursor: hasMore ? String(safeOffset + safeLimit) : null };
}
