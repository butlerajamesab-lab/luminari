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

export type RuralAccessMode =
  | "rural"
  | "frontier"
  | "remote"
  | "statewide_remote_service"
  | "regional_service_area"
  | "transportation_barrier"
  | "telehealth_available"
  | "phone_intake_available"
  | "online_intake_available"
  | "in_person_only";

export type JurisdictionMetadata = {
  jurisdiction?: string | null;
  jurisdictionType?: JurisdictionType | null;
  jurisdictionCode?: string | null;
  country?: string | null;
  state?: string | null;
  stateCode?: string | null;
  territory?: string | null;
  territoryCode?: string | null;
  districtOfColumbia?: boolean | null;
  tribalNation?: string | null;
  federalRecognitionStatus?: string | null;
  tribalGovernmentName?: string | null;
  tribalCourtName?: string | null;
  reservationOrServiceArea?: string | null;
  stateOverlap?: string[] | null;
  federalAgencyOverlap?: string[] | null;
  sourceAuthority?: string | null;
  county?: string | null;
  countyFips?: string | null;
  city?: string | null;
  municipality?: string | null;
  municipalCode?: string | null;
  region?: string | null;
  federalDistrict?: string | null;
  federalCircuit?: string | null;
  courtLevel?: string | null;
  agencyLevel?: string | null;
  serviceArea?: string | null;
  coverageArea?: string | null;
  ruralUrbanClassification?: string | null;
  ruralAccess?: RuralAccessMode[] | null;
  sourceJurisdictionText?: string | null;
  jurisdictionConfidence?: number | null;
  jurisdictionNotes?: string | null;
};

export type JurisdictionLink = JurisdictionMetadata & {
  relation: "primary" | "overlap" | "administered_by" | "enforced_by" | "appeal_to" | "service_area";
};

export type JurisdictionAwareRecord = {
  recordId: string;
  pipelineContext: (typeof PIPELINE_CONTEXTS)[number];
  domain?: (typeof NATIONWIDE_DOMAINS)[number] | string | null;
  runtimeSurface?: (typeof RUNTIME_SURFACES)[number] | string | null;
  jurisdiction: JurisdictionMetadata;
  jurisdictions?: JurisdictionLink[];
  sourceText?: string | null;
};

export type CoverageReportKind =
  | "federal_coverage_matrix"
  | "fifty_state_coverage_matrix"
  | "district_of_columbia_coverage_report"
  | "territory_coverage_matrix"
  | "tribal_jurisdiction_coverage_report"
  | "county_coverage_matrix"
  | "municipal_coverage_matrix"
  | "rural_access_coverage_report"
  | "urban_access_coverage_report"
  | "regional_multi_jurisdiction_coverage_report"
  | "domain_by_jurisdiction_coverage_matrix"
  | "runtime_surface_by_jurisdiction_coverage_matrix"
  | "pipeline_context_by_jurisdiction_coverage_matrix";

export type CoverageMatrixRow = {
  reportKind: CoverageReportKind;
  jurisdictionType: JurisdictionType;
  jurisdictionCode: string;
  jurisdictionName: string;
  domain?: string;
  runtimeSurface?: string;
  pipelineContext?: string;
  coverageState: CoverageState;
  canonicalCount: number;
  stagedCount: number;
  candidateCount: number;
  backlogCount: number;
  knownGapCount: number;
  notes?: string;
};

const stateByCode = new Map(US_STATES.map((state) => [state.code.toLowerCase(), state]));
const stateByName = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state]));
const territoryByCode = new Map(US_TERRITORIES.map((territory) => [territory.code.toLowerCase(), territory]));
const territoryByName = new Map(US_TERRITORIES.map((territory) => [territory.name.toLowerCase(), territory]));

export function detectJurisdictionFromText(sourceText: string): JurisdictionMetadata {
  const normalized = sourceText.trim();
  const lower = normalized.toLowerCase();

  if (/\b(tribe|tribal|nation|reservation|icwa|bia|ihs|bie|indian country)\b/i.test(normalized)) {
    return {
      jurisdiction: normalized,
      jurisdictionType: "tribal",
      country: "US",
      sourceJurisdictionText: sourceText,
      jurisdictionConfidence: 0.55,
      jurisdictionNotes: "Tribal indicators detected; preserve as tribal until reviewed, not as generic state/federal.",
    };
  }

  if (/\b(district of columbia|washington, dc|washington d\.c\.|\bdc\b)\b/i.test(normalized)) {
    return {
      jurisdiction: "District of Columbia",
      jurisdictionType: "district_of_columbia",
      jurisdictionCode: "DC",
      country: "US",
      districtOfColumbia: true,
      sourceJurisdictionText: sourceText,
      jurisdictionConfidence: 0.9,
    };
  }

  for (const territory of US_TERRITORIES) {
    if (lower.includes(territory.name.toLowerCase()) || new RegExp(`\\b${territory.code.toLowerCase()}\\b`).test(lower)) {
      return {
        jurisdiction: territory.name,
        jurisdictionType: "territory",
        jurisdictionCode: territory.code,
        country: "US",
        territory: territory.name,
        territoryCode: territory.code,
        sourceJurisdictionText: sourceText,
        jurisdictionConfidence: 0.85,
      };
    }
  }

  for (const state of US_STATES) {
    if (lower.includes(state.name.toLowerCase()) || new RegExp(`\\b${state.code.toLowerCase()}\\b`).test(lower)) {
      return {
        jurisdiction: state.name,
        jurisdictionType: "state",
        jurisdictionCode: state.code,
        country: "US",
        state: state.name,
        stateCode: state.code,
        sourceJurisdictionText: sourceText,
        jurisdictionConfidence: lower.includes(state.name.toLowerCase()) ? 0.85 : 0.65,
      };
    }
  }

  if (/\b(united states|federal|u\.s\.|usa|national)\b/i.test(normalized)) {
    return {
      jurisdiction: "United States",
      jurisdictionType: "federal",
      jurisdictionCode: "US",
      country: "US",
      sourceJurisdictionText: sourceText,
      jurisdictionConfidence: 0.75,
    };
  }

  return {
    jurisdiction: null,
    jurisdictionType: "unknown",
    country: "US",
    sourceJurisdictionText: sourceText,
    jurisdictionConfidence: 0,
    jurisdictionNotes: "No reliable jurisdiction detected; report as missing metadata rather than dropping the record.",
  };
}

export function normalizeJurisdictionMetadata(input: JurisdictionMetadata): JurisdictionMetadata {
  const source = input.sourceJurisdictionText ?? input.jurisdiction ?? input.stateCode ?? input.territoryCode ?? "";
  const detected = source ? detectJurisdictionFromText(source) : { jurisdictionType: "unknown" as const, country: "US" };
  const byStateCode = input.stateCode ? stateByCode.get(input.stateCode.toLowerCase()) : undefined;
  const byStateName = input.state ? stateByName.get(input.state.toLowerCase()) : undefined;
  const byTerritoryCode = input.territoryCode ? territoryByCode.get(input.territoryCode.toLowerCase()) : undefined;
  const byTerritoryName = input.territory ? territoryByName.get(input.territory.toLowerCase()) : undefined;

  const state = byStateCode ?? byStateName;
  const territory = byTerritoryCode ?? byTerritoryName;
  const jurisdictionType = input.jurisdictionType ?? (territory ? "territory" : state ? "state" : detected.jurisdictionType);

  return {
    ...detected,
    ...input,
    jurisdictionType,
    country: input.country ?? "US",
    jurisdiction: input.jurisdiction ?? territory?.name ?? state?.name ?? detected.jurisdiction,
    jurisdictionCode: input.jurisdictionCode ?? territory?.code ?? state?.code ?? detected.jurisdictionCode,
    state: input.state ?? state?.name ?? detected.state,
    stateCode: input.stateCode ?? state?.code ?? detected.stateCode,
    territory: input.territory ?? territory?.name ?? detected.territory,
    territoryCode: input.territoryCode ?? territory?.code ?? detected.territoryCode,
    sourceJurisdictionText: input.sourceJurisdictionText ?? detected.sourceJurisdictionText,
    jurisdictionConfidence: input.jurisdictionConfidence ?? detected.jurisdictionConfidence ?? 0,
  };
}

export function hasOverlappingJurisdiction(record: JurisdictionAwareRecord): boolean {
  return (record.jurisdictions?.length ?? 0) > 1 || record.jurisdiction.jurisdictionType === "mixed";
}

export function buildCoverageMatrix(records: JurisdictionAwareRecord[]): CoverageMatrixRow[] {
  const rows = new Map<string, CoverageMatrixRow>();

  const ensureRow = (
    reportKind: CoverageReportKind,
    jurisdictionType: JurisdictionType,
    jurisdictionCode: string,
    jurisdictionName: string,
    extras: Partial<CoverageMatrixRow> = {},
  ) => {
    const key = [reportKind, jurisdictionType, jurisdictionCode, extras.domain, extras.runtimeSurface, extras.pipelineContext].join("::");
    if (!rows.has(key)) {
      rows.set(key, {
        reportKind,
        jurisdictionType,
        jurisdictionCode,
        jurisdictionName,
        coverageState: "known_gap",
        canonicalCount: 0,
        stagedCount: 0,
        candidateCount: 0,
        backlogCount: 0,
        knownGapCount: 1,
        ...extras,
      });
    }
    return rows.get(key)!;
  };

  ensureRow("federal_coverage_matrix", "federal", "US", "United States");
  for (const state of US_STATES) ensureRow("fifty_state_coverage_matrix", "state", state.code, state.name);
  ensureRow("district_of_columbia_coverage_report", "district_of_columbia", "DC", "District of Columbia");
  for (const territory of US_TERRITORIES) ensureRow("territory_coverage_matrix", "territory", territory.code, territory.name);

  for (const record of records) {
    const jurisdictions = record.jurisdictions?.length ? record.jurisdictions : [{ ...record.jurisdiction, relation: "primary" as const }];
    for (const link of jurisdictions) {
      const meta = normalizeJurisdictionMetadata(link);
      const jurisdictionType = meta.jurisdictionType ?? "unknown";
      const jurisdictionCode = meta.jurisdictionCode ?? meta.countyFips ?? meta.municipalCode ?? meta.jurisdiction ?? "UNKNOWN";
      const jurisdictionName = meta.jurisdiction ?? meta.county ?? meta.city ?? meta.tribalNation ?? "Unknown jurisdiction";
      const reportKind: CoverageReportKind =
        jurisdictionType === "federal" ? "federal_coverage_matrix" :
        jurisdictionType === "state" ? "fifty_state_coverage_matrix" :
        jurisdictionType === "district_of_columbia" ? "district_of_columbia_coverage_report" :
        jurisdictionType === "territory" ? "territory_coverage_matrix" :
        jurisdictionType === "tribal" ? "tribal_jurisdiction_coverage_report" :
        jurisdictionType === "county" ? "county_coverage_matrix" :
        jurisdictionType === "municipal" ? "municipal_coverage_matrix" :
        jurisdictionType === "regional" || jurisdictionType === "interstate" || jurisdictionType === "federal_circuit" || jurisdictionType === "administrative_region" ? "regional_multi_jurisdiction_coverage_report" :
        "domain_by_jurisdiction_coverage_matrix";

      const primary = ensureRow(reportKind, jurisdictionType, jurisdictionCode, jurisdictionName, { knownGapCount: 0 });
      primary.knownGapCount = 0;
      if (record.pipelineContext === "canonical") primary.canonicalCount += 1;
      if (record.pipelineContext === "staged") primary.stagedCount += 1;
      if (record.pipelineContext === "candidate") primary.candidateCount += 1;
      if (["queue", "backlog", "review", "promotion_batch"].includes(record.pipelineContext)) primary.backlogCount += 1;

      for (const [kind, field, value] of [
        ["domain_by_jurisdiction_coverage_matrix", "domain", record.domain],
        ["runtime_surface_by_jurisdiction_coverage_matrix", "runtimeSurface", record.runtimeSurface],
        ["pipeline_context_by_jurisdiction_coverage_matrix", "pipelineContext", record.pipelineContext],
      ] as const) {
        if (!value) continue;
        const row = ensureRow(kind, jurisdictionType, jurisdictionCode, jurisdictionName, { [field]: value, knownGapCount: 0 });
        row.knownGapCount = 0;
        if (record.pipelineContext === "canonical") row.canonicalCount += 1;
        if (record.pipelineContext === "staged") row.stagedCount += 1;
        if (record.pipelineContext === "candidate") row.candidateCount += 1;
        if (["queue", "backlog", "review", "promotion_batch"].includes(record.pipelineContext)) row.backlogCount += 1;
      }

      if (meta.ruralUrbanClassification?.toLowerCase().includes("rural") || meta.ruralAccess?.length) {
        ensureRow("rural_access_coverage_report", jurisdictionType, jurisdictionCode, jurisdictionName, { knownGapCount: 0 });
      }
      if (meta.ruralUrbanClassification?.toLowerCase().includes("urban")) {
        ensureRow("urban_access_coverage_report", jurisdictionType, jurisdictionCode, jurisdictionName, { knownGapCount: 0 });
      }
    }
  }

  return [...rows.values()].map((row) => ({
    ...row,
    coverageState:
      row.canonicalCount > 0 ? "covered" :
      row.stagedCount > 0 ? "staged_not_promoted" :
      row.candidateCount > 0 ? "candidate_only" :
      row.backlogCount > 0 ? "partially_covered" :
      row.knownGapCount > 0 ? "known_gap" :
      "unknown",
  }));
}

export function paginateCompleteExport<T>(items: T[], cursor = 0, limit = 1000): { items: T[]; nextCursor: number | null; total: number } {
  const safeCursor = Math.max(0, cursor);
  const safeLimit = Math.max(1, limit);
  const page = items.slice(safeCursor, safeCursor + safeLimit);
  const nextCursor = safeCursor + page.length < items.length ? safeCursor + page.length : null;
  return { items: page, nextCursor, total: items.length };
}
