/**
 * Agency Knowledge Base (AKB) Lookup Helpers
 * 
 * Deterministic lookups against the FOIA agency/statute/record-type tables.
 * No LLM calls — pure relational queries.
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  foiaStatutes, foiaAgencies, foiaRecordTypes, foiaAgencyRecords,
  type FoiaStatute, type FoiaAgency, type FoiaRecordType, type FoiaAgencyRecord,
} from "../drizzle/schema";

// ─── Database Connection ───
// FIXED: Use direct connection to luminari_registry instead of broken DATABASE_URL
const pool = mysql.createPool({
  host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
  port: 4000,
  user: "2jhK1AfHyk6mXSq.root",
  password: "2k5Lq94U8voiLkatA3uZ",
  database: "luminari_registry",
  ssl: {
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
const db = drizzle(pool);

// ─── Domain Key Mapping ───
// Maps pipeline types / situation contexts to AKB domain keys
const DOMAIN_KEY_MAP: Record<string, string> = {
  police_misconduct: "policemisconduct",
  icwa: "icwa",
  insurance_denial: "insurance",
  elder_abuse: "elderabuse",
  // Aliases for flexibility
  policemisconduct: "policemisconduct",
  insurance: "insurance",
  elderabuse: "elderabuse",
};

export function normalizeDomainKey(pipelineType: string): string | null {
  return DOMAIN_KEY_MAP[pipelineType] ?? null;
}

// ─── Core Lookup: Which agencies hold a specific record type? ───
export interface AgencyRecordMatch {
  agency: FoiaAgency;
  recordType: FoiaRecordType;
  statute: FoiaStatute;
  confidence: string;
}

/**
 * Given a domain and record type key, find all agencies that hold that record,
 * along with the applicable statute and confidence level.
 */
export async function getAgenciesForRecord(
  domain: string,
  recordTypeKey: string,
  stateCode: string = "WA"
): Promise<AgencyRecordMatch[]> {
  const normalizedDomain = normalizeDomainKey(domain);
  if (!normalizedDomain) return [];

  // Find the record type
  const recordTypes = await db
    .select()
    .from(foiaRecordTypes)
    .where(
      and(
        eq(foiaRecordTypes.domain, normalizedDomain),
        eq(foiaRecordTypes.recordType, recordTypeKey)
      )
    );

  if (recordTypes.length === 0) return [];
  const recordType = recordTypes[0];

  // Find all agency mappings for this record type
  const mappings = await db
    .select()
    .from(foiaAgencyRecords)
    .where(eq(foiaAgencyRecords.recordTypeId, recordType.id));

  if (mappings.length === 0) return [];

  // Fetch the agencies and statutes
  const agencyIds = mappings.map(m => m.agencyId);
  const statuteIds = Array.from(new Set(mappings.map(m => m.statuteId)));

  const agencies = await db
    .select()
    .from(foiaAgencies)
    .where(
      and(
        inArray(foiaAgencies.id, agencyIds),
        eq(foiaAgencies.stateCode, stateCode)
      )
    );

  const statutes = await db
    .select()
    .from(foiaStatutes)
    .where(inArray(foiaStatutes.id, statuteIds));

  const agencyMap = new Map(agencies.map(a => [a.id, a]));
  const statuteMap = new Map(statutes.map(s => [s.id, s]));

  const results: AgencyRecordMatch[] = [];
  for (const mapping of mappings) {
    const agency = agencyMap.get(mapping.agencyId);
    const statute = statuteMap.get(mapping.statuteId);
    if (agency && statute) {
      results.push({
        agency,
        recordType,
        statute,
        confidence: mapping.confidence,
      });
    }
  }

  return results;
}

// ─── Bulk Lookup: For all missing records in a case, find agencies ───
export interface MissingRecordWithAgency {
  recordType: string;
  description: string;
  severity: string;
  agencies: Array<{
    agencyName: string;
    agencyComponent: string | null;
    portalUrl: string | null;
    email: string | null;
    mailingAddress: string | null;
    submissionMethods: string;
    statuteName: string;
    statuteReference: string;
    responseDeadlineDays: number | null;
    feeWaiverAvailable: boolean;
    confidence: string;
  }>;
}

/**
 * Given a list of missing record types for a domain, resolve all agency contacts
 * and statute details for each one.
 */
export async function resolveAgenciesForMissingRecords(
  domain: string,
  missingRecordTypes: Array<{ recordType: string; description: string; severity: string }>,
  stateCode: string = "WA"
): Promise<MissingRecordWithAgency[]> {
  const results: MissingRecordWithAgency[] = [];

  for (const missing of missingRecordTypes) {
    const matches = await getAgenciesForRecord(domain, missing.recordType, stateCode);
    results.push({
      recordType: missing.recordType,
      description: missing.description,
      severity: missing.severity,
      agencies: matches.map(m => ({
        agencyName: m.agency.agencyName,
        agencyComponent: m.agency.agencyComponent,
        portalUrl: m.agency.portalUrl,
        email: m.agency.email,
        mailingAddress: m.agency.mailingAddress,
        submissionMethods: m.agency.submissionMethods,
        statuteName: m.statute.lawName,
        statuteReference: m.statute.statuteReference,
        responseDeadlineDays: m.statute.responseDeadlineDays,
        feeWaiverAvailable: m.statute.feeWaiverAvailable,
        confidence: m.confidence,
      })),
    });
  }

  return results;
}

// ─── Statute Lookup ───
export async function getStatutesForState(stateCode: string = "WA"): Promise<FoiaStatute[]> {
  return db.select().from(foiaStatutes).where(eq(foiaStatutes.stateCode, stateCode));
}

// ─── Agency Listing ───
export async function getAgenciesForState(stateCode: string = "WA"): Promise<FoiaAgency[]> {
  return db.select().from(foiaAgencies).where(eq(foiaAgencies.stateCode, stateCode));
}

// ─── Record Types by Domain ───
export async function getRecordTypesForDomain(domain: string): Promise<FoiaRecordType[]> {
  const normalizedDomain = normalizeDomainKey(domain);
  if (!normalizedDomain) return [];
  return db.select().from(foiaRecordTypes).where(eq(foiaRecordTypes.domain, normalizedDomain));
}

// ─── Coverage Check: Does the AKB have data for a given domain + state? ───
export async function hasAKBCoverage(domain: string, stateCode: string = "WA"): Promise<boolean> {
  const normalizedDomain = normalizeDomainKey(domain);
  if (!normalizedDomain) return false;

  const recordTypes = await db
    .select({ count: sql<number>`count(*)` })
    .from(foiaRecordTypes)
    .where(eq(foiaRecordTypes.domain, normalizedDomain));

  const agencies = await db
    .select({ count: sql<number>`count(*)` })
    .from(foiaAgencies)
    .where(eq(foiaAgencies.stateCode, stateCode));

  return (recordTypes[0]?.count ?? 0) > 0 && (agencies[0]?.count ?? 0) > 0;
}
