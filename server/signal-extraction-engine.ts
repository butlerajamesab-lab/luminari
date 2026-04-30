/**
 * Signal Extraction Layer (Final)
 * 
 * Lightweight extraction only. No premature inference. No blocking.
 * Input: document with Pass 1+2 data (entities, claims, signal flags)
 * Output: one normalized structured record per document
 * 
 * Pipeline position: Evidence Lab → Signal Extraction → Claim Validation
 */

import { createHash } from "crypto";
import { db as drizzleDb } from "./db";
import { signalExtractions } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// ─── Normalization Rules ───

/** T1: Strip company suffixes, lowercase, trim */
function normalizeCompany(name: string): string {
  return name
    .replace(/\b(inc\.?|llc\.?|corp\.?|co\.?|ltd\.?|l\.?p\.?|plc\.?|group|holdings?|enterprises?|services?|international)\b/gi, "")
    .replace(/[.,]+$/, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** T2: Normalize location to city + county + state_code */
function normalizeState(state: string): string | null {
  const s = state.trim().toUpperCase();
  const stateMap: Record<string, string> = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
    "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID",
    "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
    "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
    "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
    "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT",
    "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI", "WYOMING": "WY", "DISTRICT OF COLUMBIA": "DC",
    "PUERTO RICO": "PR", "GUAM": "GU", "AMERICAN SAMOA": "AS",
    "US VIRGIN ISLANDS": "VI", "NORTHERN MARIANA ISLANDS": "MP",
  };
  if (s.length === 2 && Object.values(stateMap).includes(s)) return s;
  return stateMap[s] || null;
}

/** T3: Parse date to ISO 8601, null if unparseable. NEVER guess. */
function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

/** T4: Fingerprint = hash(company_normalized + complaint.type + state) */
function computeFingerprint(company: string, complaintType: string, state: string): string {
  const input = `${normalizeCompany(company)}|${(complaintType || "").toLowerCase().trim()}|${(state || "").toUpperCase().trim()}`;
  return createHash("sha256").update(input).digest("hex").substring(0, 32);
}

/** T5: Categorize complaint into standard categories */
function categorizeComplaint(rawCategory: string, description: string): "financial" | "medical" | "housing" | "legal" | "other" {
  const combined = `${rawCategory} ${description}`.toLowerCase();
  if (/mortgage|loan|credit|debt|bank|financ|payment|billing|collect|interest|fee|money|invest|fraud|scam/.test(combined)) return "financial";
  if (/medic|health|hospital|doctor|pharma|drug|treatment|insur.*claim|dental|mental/.test(combined)) return "medical";
  if (/hous|rent|tenant|landlord|evict|property|lease|apartment|dwelling|shelter|homeless/.test(combined)) return "housing";
  if (/court|legal|attorney|lawyer|judge|custody|divorce|arrest|criminal|civil|lawsuit|litigation/.test(combined)) return "legal";
  return "other";
}

// ─── Core Extraction Function ───

export interface SignalExtractionRecord {
  doc_id: number;
  entities: { people: string[]; companies: string[]; agencies: string[] };
  complaint: { type: string; description: string; category: string; raw_category: string };
  location: { city: string | null; county: string | null; state: string | null };
  timeline: { event_date: string | null; filed_date: string | null };
  signals: { fingerprint: string; keywords: string[] };
  source: { source_id: string; dataset: string };
}

/**
 * Extract structured, normalized data from a document's Pass 1+2 output.
 * Lightweight extraction only. No premature inference. No blocking.
 */
export async function extractSignals(documentId: number, caseId: number): Promise<SignalExtractionRecord> {
  // Fetch Pass 1+2 data from existing tables
  const [entitiesRows] = await drizzleDb.execute(
    sql`SELECT id, name, type FROM entities WHERE documentId = ${documentId}`
  );
  const [claimsRows] = await drizzleDb.execute(
    sql`SELECT id, claimText, claimType FROM claims WHERE caseId = ${caseId} AND JSON_CONTAINS(entitiesInvolved, CAST(${documentId} AS JSON), '$')`
  );
  const [flagsRows] = await drizzleDb.execute(
    sql`SELECT id, flagType, description FROM signal_flags WHERE documentId = ${documentId}`
  );
  const [docRow] = await drizzleDb.execute(
    sql`SELECT id, filename, caseId, textContent, createdAt FROM documents WHERE id = ${documentId} LIMIT 1`
  );
  const [caseRow] = await drizzleDb.execute(
    sql`SELECT id, name, domain, container FROM cases WHERE id = ${caseId} LIMIT 1`
  );

  const entities = Array.isArray(entitiesRows) ? entitiesRows as any[] : [];
  const claims = Array.isArray(claimsRows) ? claimsRows as any[] : [];
  const flags = Array.isArray(flagsRows) ? flagsRows as any[] : [];
  const doc = Array.isArray(docRow) && docRow.length > 0 ? (docRow as any[])[0] : null;
  const caseInfo = Array.isArray(caseRow) && caseRow.length > 0 ? (caseRow as any[])[0] : null;

  // T1: Classify entities
  const people: string[] = [];
  const companies: string[] = [];
  const agencies: string[] = [];
  for (const e of entities) {
    const name = (e.name || "").trim();
    const type = (e.type || "").toLowerCase();
    if (type === "person" || type === "individual") people.push(name);
    else if (type === "company" || type === "organization" || type === "corporation") companies.push(normalizeCompany(name));
    else if (type === "agency" || type === "government" || type === "regulator") agencies.push(name);
    else people.push(name); // default to person
  }

  // T2: Extract complaint info from claims and flags
  const primaryClaim = claims[0] || {};
  const complaintType = primaryClaim.claimType || flags[0]?.flagType || "";
  const complaintDescription = primaryClaim.claimText || flags[0]?.description || "";
  const rawCategory = caseInfo?.domain || "";
  const category = categorizeComplaint(rawCategory, complaintDescription);

  // T3: Extract location from text (lightweight regex)
  let city: string | null = null;
  let county: string | null = null;
  let state: string | null = null;
  const textContent = doc?.textContent || "";
  
  // Try to find state references in text
  const statePattern = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i;
  const stateMatch = textContent.match(statePattern);
  if (stateMatch) state = normalizeState(stateMatch[1]);

  // County pattern
  const countyPattern = /(\w[\w\s]*?)\s+County/i;
  const countyMatch = textContent.match(countyPattern);
  if (countyMatch) county = countyMatch[1].trim();

  // T4: Timeline from document metadata
  const eventDate = normalizeDate(null); // no event date without explicit source
  const filedDate = normalizeDate(doc?.createdAt ? new Date(Number(doc.createdAt)).toISOString() : null);

  // T5: Fingerprint
  const primaryCompany = companies[0] || "";
  const fingerprint = computeFingerprint(primaryCompany, complaintType, state || "");

  // T6: Keywords from flags and claims
  const keywords: string[] = [];
  for (const f of flags) {
    if (f.flagType) keywords.push(f.flagType.toLowerCase());
  }
  for (const c of claims) {
    if (c.claimType) keywords.push(c.claimType.toLowerCase());
  }
  // Deduplicate
  const uniqueKeywords = [...new Set(keywords)];

  const record: SignalExtractionRecord = {
    doc_id: documentId,
    entities: { people, companies, agencies },
    complaint: { type: complaintType, description: complaintDescription, category, raw_category: rawCategory },
    location: { city, county, state },
    timeline: { event_date: eventDate, filed_date: filedDate },
    signals: { fingerprint, keywords: uniqueKeywords },
    source: { source_id: String(documentId), dataset: caseInfo?.name || "" },
  };

  return record;
}

/**
 * Extract and persist signal extraction record for a document.
 * Idempotent: deletes existing extraction for the doc before inserting.
 */
export async function extractAndPersist(documentId: number, caseId: number): Promise<SignalExtractionRecord> {
  const record = await extractSignals(documentId, caseId);

  // Delete existing extraction for this doc (idempotent)
  await drizzleDb.delete(signalExtractions).where(eq(signalExtractions.docId, documentId));

  // Persist
  await drizzleDb.insert(signalExtractions).values({
    docId: record.doc_id,
    caseId,
    entitiesPeople: JSON.stringify(record.entities.people),
    entitiesCompanies: JSON.stringify(record.entities.companies),
    entitiesAgencies: JSON.stringify(record.entities.agencies),
    complaintType: record.complaint.type || null,
    complaintDescription: record.complaint.description || null,
    complaintCategory: record.complaint.category as any,
    complaintRawCategory: record.complaint.raw_category || null,
    locationCity: record.location.city,
    locationCounty: record.location.county,
    locationState: record.location.state,
    eventDate: record.timeline.event_date,
    filedDate: record.timeline.filed_date,
    fingerprint: record.signals.fingerprint,
    keywords: JSON.stringify(record.signals.keywords),
    sourceId: record.source.source_id,
    dataset: record.source.dataset,
    extractedAt: Date.now(),
  });

  console.log(`[SignalExtraction] Extracted doc ${documentId} → fingerprint: ${record.signals.fingerprint.substring(0, 12)}...`);
  return record;
}

/**
 * Batch extract all documents in a case.
 */
export async function extractCase(caseId: number): Promise<{ total: number; extracted: number; errors: number }> {
  const [rows] = await drizzleDb.execute(
    sql`SELECT id FROM documents WHERE caseId = ${caseId} AND status = 'ready'`
  );
  const docs = Array.isArray(rows) ? rows as any[] : [];
  let extracted = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      await extractAndPersist(doc.id, caseId);
      extracted++;
    } catch (err) {
      console.warn(`[SignalExtraction] Error extracting doc ${doc.id}:`, err);
      errors++;
    }
  }

  console.log(`[SignalExtraction] Case ${caseId}: ${extracted}/${docs.length} extracted, ${errors} errors`);
  return { total: docs.length, extracted, errors };
}
