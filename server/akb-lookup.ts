/**
 * AKB (Agency Knowledge Base) lookup — production implementation.
 *
 * Reconnected 2026-08-26. The previous module was a stub left over from the
 * TiDB cleanup; every function returned empty results, which silently disabled
 * FOIA letter enrichment (no statute, no agency, no deadline).
 *
 * Reads the live snake_case reference tables (production convention — the
 * camelCase drizzle defs were pre-transition artifacts):
 *
 *   foia_statutes       — federal FOIA + all 50 states + DC (52 rows; citation,
 *                         response period, extension rule, appeal note, official link)
 *   foia_agencies       — 615 federal FOIA components across 129 agencies
 *                         (source: api.foia.gov, payload hash8 676d2d5e)
 *   foia_record_types   — domain/record-type catalog (seeded from observed
 *                         missing_records; grows as new domains seed)
 *   foia_agency_records — routing: record_type -> agency + statute + confidence
 *
 * Read-only. All queries use getPool() with bound parameters.
 */

import { getPool } from "./db-legacy";

export type AkbConfidence = "high" | "medium" | "low";

export interface AkbStatute {
  id: number;
  stateCode: string;
  lawName: string;
  statuteReference: string;
  responseDeadlineDays: number | null;
  responseDeadlineUnit: string | null;   // 'business_days' | 'calendar_days' | null
  extensionRule: string | null;
  appealDeadlineDays: number | null;
  appealNote: string | null;
  feeWaiverAvailable: boolean;
  expeditedProcessingAvailable: boolean;
  officialUrl: string | null;
  notes: string | null;
}

export interface AkbAgency {
  id: number;
  stateCode: string;
  agencyName: string;
  agencyComponent: string | null;
  jurisdictionLevel: string | null;
  mailingAddress: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  portalUrl: string | null;
  readingRoom: string | null;
  submissionMethods: string;            // 'portal' | 'email' | 'mail' | 'mixed'
}

export interface AgencyRecordMatch {
  confidence: AkbConfidence;
  agency: AkbAgency | null;             // null on statute-only fallback
  statute: AkbStatute | null;
  routingNotes: string | null;
}

export interface AkbRecordType {
  id: number;
  domain: string;
  recordType: string;
  recordDescription: string;
  typicalKeywords: string[] | null;
  retentionNotes: string | null;
}

// ─── Row mappers (snake_case production columns) ───

function mapStatute(r: any): AkbStatute {
  return {
    id: r.id,
    stateCode: r.state_code,
    lawName: r.statute_name,
    statuteReference: r.citation,
    responseDeadlineDays: r.response_days ?? null,
    responseDeadlineUnit: r.response_days_unit ?? null,
    extensionRule: r.extension_rule ?? null,
    appealDeadlineDays: r.appeal_deadline_days ?? null,
    appealNote: r.appeal_note ?? null,
    feeWaiverAvailable: r.fee_waiver_available ?? true,
    expeditedProcessingAvailable: r.expedited_processing_available ?? false,
    officialUrl: r.official_url ?? null,
    notes: r.notes ?? null,
  };
}

function mapAgency(r: any): AkbAgency {
  return {
    id: r.id,
    stateCode: r.state_code,
    agencyName: r.agency_name,
    agencyComponent: r.component_name ?? null,
    jurisdictionLevel: r.jurisdiction_level ?? null,
    mailingAddress: r.address ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    website: r.website ?? null,
    portalUrl: r.submission_portal ?? null,
    readingRoom: r.reading_room ?? null,
    submissionMethods: r.submission_methods ?? "mixed",
  };
}

function mapRecordType(r: any): AkbRecordType {
  return {
    id: r.id,
    domain: r.domain,
    recordType: r.record_type,
    recordDescription: r.record_description,
    typicalKeywords: r.typical_keywords ?? null,
    retentionNotes: r.retention_notes ?? null,
  };
}

/** Normalize a domain/pipeline key: lowercase, trimmed, spaces/dashes to underscores. */
export function normalizeDomainKey(key: string): string {
  return (key ?? "").toLowerCase().trim().replace(/[\s\-]+/g, "_");
}

// ─── Statute / agency / record-type lookups ───

/**
 * Statutes applicable to a state: the state's own public-records law plus the
 * federal FOIA. State row first so callers can prefer it.
 */
export async function getStatutesForState(stateCode: string): Promise<AkbStatute[]> {
  const code = (stateCode ?? "").toUpperCase().trim();
  const { rows } = await getPool().query(
    `select id, state_code, statute_name, citation, response_days, response_days_unit,
            extension_rule, appeal_deadline_days, appeal_note,
            fee_waiver_available, expedited_processing_available, official_url, notes
       from public.foia_statutes
      where state_code = $1 or state_code = 'US'
      order by case when state_code = $1 then 0 else 1 end`,
    [code],
  );
  return rows.map(mapStatute);
}

/** Single statute by primary key. Used by the submission transition to start the response clock. */
export async function getStatuteById(id: number): Promise<AkbStatute | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await getPool().query(
    `select id, state_code, statute_name, citation, response_days, response_days_unit,
            extension_rule, appeal_deadline_days, appeal_note,
            fee_waiver_available, expedited_processing_available, official_url, notes
       from public.foia_statutes where id = $1`,
    [id],
  );
  return rows.length > 0 ? mapStatute(rows[0]) : null;
}

/** Agencies applicable to a state: state-level rows plus all federal components. */
export async function getAgenciesForState(stateCode: string): Promise<AkbAgency[]> {
  const code = (stateCode ?? "").toUpperCase().trim();
  const { rows } = await getPool().query(
    `select id, state_code, agency_name, component_name, jurisdiction_level,
            address, email, phone, website, submission_portal, reading_room, submission_methods
       from public.foia_agencies
      where state_code = $1 or state_code = 'US'
      order by case when state_code = $1 then 0 else 1 end, agency_name, component_name`,
    [code],
  );
  return rows.map(mapAgency);
}

/** Record types cataloged for a domain. */
export async function getRecordTypesForDomain(domain: string): Promise<AkbRecordType[]> {
  const { rows } = await getPool().query(
    `select id, domain, record_type, record_description, typical_keywords, retention_notes
       from public.foia_record_types
      where domain = $1
      order by record_type`,
    [normalizeDomainKey(domain)],
  );
  return rows.map(mapRecordType);
}

// ─── Routing: record -> agencies + statute ───

/**
 * Resolve candidate agencies + statute for a missing record.
 *
 * 1. Routing table (foia_agency_records) — curated, confidence-scored matches.
 * 2. Fallback: statute-only match (agency = null) so generated letters still cite
 *    the correct statute and deadline even when no agency is mapped yet.
 *
 * Returns [] only when no statute exists for the state at all.
 */
export async function getAgenciesForRecord(
  domain: string,
  recordType: string,
  stateCode: string,
): Promise<AgencyRecordMatch[]> {
  const { rows } = await getPool().query(
    `select ar.confidence, ar.notes as routing_notes,
            a.id as agency_id, a.state_code as agency_state_code, a.agency_name, a.component_name,
            a.jurisdiction_level as agency_jurisdiction, a.address, a.email, a.phone, a.website,
            a.submission_portal, a.reading_room, a.submission_methods,
            s.id as statute_id, s.state_code as statute_state_code, s.statute_name, s.citation,
            s.response_days, s.response_days_unit, s.extension_rule, s.appeal_deadline_days,
            s.appeal_note, s.fee_waiver_available, s.expedited_processing_available,
            s.official_url, s.notes as statute_notes
       from public.foia_record_types rt
       join public.foia_agency_records ar on ar.record_type_id = rt.id
       join public.foia_agencies a on a.id = ar.agency_id
       join public.foia_statutes s on s.id = ar.statute_id
      where rt.domain = $1 and rt.record_type = $2`,
    [normalizeDomainKey(domain), recordType],
  );

  if (rows.length > 0) {
    return rows.map((r: any): AgencyRecordMatch => ({
      confidence: r.confidence as AkbConfidence,
      agency: mapAgency({
        id: r.agency_id,
        state_code: r.agency_state_code,
        agency_name: r.agency_name,
        component_name: r.component_name,
        jurisdiction_level: r.agency_jurisdiction,
        address: r.address,
        email: r.email,
        phone: r.phone,
        website: r.website,
        submission_portal: r.submission_portal,
        reading_room: r.reading_room,
        submission_methods: r.submission_methods,
      }),
      statute: mapStatute({
        id: r.statute_id,
        state_code: r.statute_state_code,
        statute_name: r.statute_name,
        citation: r.citation,
        response_days: r.response_days,
        response_days_unit: r.response_days_unit,
        extension_rule: r.extension_rule,
        appeal_deadline_days: r.appeal_deadline_days,
        appeal_note: r.appeal_note,
        fee_waiver_available: r.fee_waiver_available,
        expedited_processing_available: r.expedited_processing_available,
        official_url: r.official_url,
        notes: r.statute_notes,
      }),
      routingNotes: r.routing_notes ?? null,
    }));
  }

  // Statute-only fallback — letter cites the right law; agency resolution
  // stays with the caller (e.g. missing_record.agency_type or manual choice).
  const statutes = await getStatutesForState(stateCode);
  if (statutes.length === 0) return [];
  const code = (stateCode ?? "").toUpperCase().trim();
  const preferred = statutes.find(s => s.stateCode === code) ?? statutes[0];
  return [{ confidence: "low", agency: null, statute: preferred, routingNotes: null }];
}

/** True when the record-type catalog covers this pipeline/domain. */
export async function hasAKBCoverage(pipelineType: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `select exists(select 1 from public.foia_record_types where domain = $1) as covered`,
    [normalizeDomainKey(pipelineType)],
  );
  return Boolean(rows[0]?.covered);
}

export const AKBMissingRecords: any[] = [];

/**
 * Attach agency/statute matches to each missing record for the case router
 * (foia.agenciesForCase). Input records: { recordType, description, severity }.
 */
export async function resolveAgenciesForMissingRecords(
  pipelineType: string,
  records: Array<{ recordType: string; description?: string; severity?: string }>,
  stateCode = "WA",
): Promise<Array<{ recordType: string; description?: string; severity?: string; agencies: AgencyRecordMatch[] }>> {
  const out = [];
  for (const rec of records) {
    const agencies = await getAgenciesForRecord(pipelineType, rec.recordType, stateCode);
    out.push({ ...rec, agencies });
  }
  return out;
}
