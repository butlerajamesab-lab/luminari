/**
 * Signal Extraction Layer (Expanded)
 * 
 * 11 field groups: entities, complaint, location, timeline, signals, source,
 *                  impact, legal, involvement, severity, evidence
 * 
 * Lightweight extraction only. No premature inference. No blocking.
 * Input: document with Pass 1+2 data (entities, claims, signal flags)
 * Output: one normalized structured record per document
 * 
 * Pipeline position: Evidence Lab → Signal Extraction → Tsunam Gate → detected_signals
 * 
 * SEVERITY RULE: integer 1–10, derived ONLY from victim_count * category_weight + amount_factor.
 *   Null if insufficient data. No estimation.
 * EVIDENCE RULE: verbatim quotes only, max 3 per document, max 200 chars each,
 *   from document body only. No metadata, no headers.
 */

import { createHash } from "crypto";
import { db as drizzle_db } from "./db";
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

// ─── Impact Extraction (T6) ───

/** Category weights for severity calculation */
const CATEGORY_WEIGHTS: Record<string, number> = {
  financial: 3, medical: 4, housing: 3, legal: 2, other: 1,
};

/**
 * T6: Extract monetary amounts from text. Returns all found amounts.
 * Only extracts explicit dollar amounts. No estimation.
 */
function extractAmounts(text: string): number[] {
  if (!text) return [];
  const amounts: number[] = [];
  // Match $X, $X.XX, $X,XXX, $X,XXX.XX, $X million/billion
  const patterns = [
    /\$\s?([\d,]+(?:\.\d{1,2})?)\s*(?:million|mil)/gi,
    /\$\s?([\d,]+(?:\.\d{1,2})?)\s*(?:billion|bil)/gi,
    /\$\s?([\d,]+(?:\.\d{1,2})?)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1].replace(/,/g, "");
      let val = parseFloat(raw);
      if (isNaN(val)) continue;
      if (/million|mil/i.test(match[0])) val *= 1_000_000;
      if (/billion|bil/i.test(match[0])) val *= 1_000_000_000;
      if (val > 0 && val < 1e12) amounts.push(val); // sanity cap at $1T
    }
  }
  return [...new Set(amounts)];
}

/**
 * T7: Extract victim/affected count from text.
 * Only explicit counts. Returns null if not found.
 */
function extractVictimCount(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /(\d[\d,]*)\s*(?:victims?|complainants?|affected\s+(?:individuals?|persons?|people|consumers?|workers?|employees?|tenants?|patients?))/i,
    /(?:affecting|impacting|harming)\s+(\d[\d,]*)\s*(?:individuals?|persons?|people|consumers?|workers?|employees?|tenants?|patients?)/i,
    /(\d[\d,]*)\s*(?:complaints?\s+(?:filed|received|reported))/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseInt(m[1].replace(/,/g, ""), 10);
      if (val > 0 && val < 10_000_000) return val; // sanity cap
    }
  }
  return null;
}

/**
 * T8: Determine impact scope from text.
 * individual | local | regional | statewide | national | null
 */
function determineImpactScope(text: string, state: string | null, victimCount: number | null): "individual" | "local" | "regional" | "statewide" | "national" | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Explicit scope mentions
  if (/nation-?wide|federal|across\s+(?:the\s+)?(?:country|nation|united\s+states)|multiple\s+states/i.test(lower)) return "national";
  if (/state-?wide|across\s+(?:the\s+)?state|throughout\s+(?:the\s+)?state/i.test(lower)) return "statewide";
  if (/region|county-?wide|multi-?county|several\s+(?:counties|cities)/i.test(lower)) return "regional";
  if (/city|local|neighborhood|community|district/i.test(lower)) return "local";
  // Infer from victim count if explicit
  if (victimCount !== null) {
    if (victimCount >= 10000) return "national";
    if (victimCount >= 1000) return "statewide";
    if (victimCount >= 100) return "regional";
    if (victimCount >= 10) return "local";
    return "individual";
  }
  return null;
}

// ─── Legal Extraction (T9) ───

/** Known statutes and their patterns */
const STATUTE_PATTERNS: { pattern: RegExp; statute: string }[] = [
  { pattern: /(?:RCW|Revised Code of Washington)\s*([\d.]+)/gi, statute: "RCW" },
  { pattern: /(?:WAC|Washington Administrative Code)\s*([\d.-]+)/gi, statute: "WAC" },
  { pattern: /(?:USC|U\.?S\.?C\.?)\s*(?:§|Section|Sec\.?)?\s*(\d+)/gi, statute: "USC" },
  { pattern: /(?:CFR|C\.?F\.?R\.?)\s*(?:§|Section|Sec\.?)?\s*(\d+)/gi, statute: "CFR" },
  { pattern: /(?:FCRA|Fair Credit Reporting Act)/gi, statute: "FCRA" },
  { pattern: /(?:FDCPA|Fair Debt Collection Practices Act)/gi, statute: "FDCPA" },
  { pattern: /(?:TILA|Truth in Lending Act)/gi, statute: "TILA" },
  { pattern: /(?:RESPA|Real Estate Settlement Procedures Act)/gi, statute: "RESPA" },
  { pattern: /(?:ECOA|Equal Credit Opportunity Act)/gi, statute: "ECOA" },
  { pattern: /(?:ADA|Americans with Disabilities Act)/gi, statute: "ADA" },
  { pattern: /(?:FLSA|Fair Labor Standards Act)/gi, statute: "FLSA" },
  { pattern: /(?:OSHA|Occupational Safety and Health Act)/gi, statute: "OSHA" },
  { pattern: /(?:CPA|Consumer Protection Act)/gi, statute: "CPA" },
  { pattern: /(?:FHA|Fair Housing Act)/gi, statute: "FHA" },
  { pattern: /(?:HIPAA|Health Insurance Portability)/gi, statute: "HIPAA" },
  { pattern: /(?:Title\s+(?:VI|VII|IX|X|XI))\b/gi, statute: "Title" },
];

/**
 * T9: Extract legal references from text.
 * Returns { statutes: string[], violations: string[], regulatory_refs: string[] }
 */
function extractLegalReferences(text: string): { statutes: string[]; violations: string[]; regulatory_refs: string[] } {
  const statutes: string[] = [];
  const violations: string[] = [];
  const regulatoryRefs: string[] = [];

  if (!text) return { statutes, violations, regulatory_refs: regulatoryRefs };

  // Extract statute references
  for (const { pattern, statute } of STATUTE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const ref = match[1] ? `${statute} ${match[1]}` : statute;
      if (!statutes.includes(ref)) statutes.push(ref);
    }
  }

  // Extract violation types from text
  const violationPatterns = [
    /(?:violation|violating|violated)\s+(?:of\s+)?([^.,;]{5,80})/gi,
    /(?:in\s+violation\s+of)\s+([^.,;]{5,80})/gi,
    /(?:unlawful|illegal|prohibited)\s+([^.,;]{5,60})/gi,
  ];
  for (const vp of violationPatterns) {
    let match;
    while ((match = vp.exec(text)) !== null) {
      const v = match[1].trim();
      if (v.length >= 5 && v.length <= 80 && !violations.includes(v)) {
        violations.push(v);
      }
    }
  }

  // Extract regulatory references (case numbers, docket numbers)
  const regPatterns = [
    /(?:Case\s+(?:No\.?|Number|#)\s*)([\w-]+(?:\s*[-/]\s*[\w-]+)*)/gi,
    /(?:Docket\s+(?:No\.?|Number|#)\s*)([\w-]+)/gi,
    /(?:Complaint\s+(?:No\.?|Number|#)\s*)([\w-]+)/gi,
    /(?:File\s+(?:No\.?|Number|#)\s*)([\w-]+)/gi,
  ];
  for (const rp of regPatterns) {
    let match;
    while ((match = rp.exec(text)) !== null) {
      const ref = match[1].trim();
      if (ref.length >= 3 && !regulatoryRefs.includes(ref)) {
        regulatoryRefs.push(ref);
      }
    }
  }

  return { statutes: statutes.slice(0, 20), violations: violations.slice(0, 10), regulatory_refs: regulatoryRefs.slice(0, 10) };
}

// ─── Involvement Extraction (T10) ───

/**
 * T10: Classify entity roles from document context.
 * Returns { complainants, respondents, witnesses, agencies_involved }
 * Derived from entity roles table + text patterns. No inference.
 */
function classifyInvolvement(
  entities: { name: string; type: string }[],
  roles: { entityId: number; entityName: string; role: string; description: string }[],
  text: string
): {
  complainants: string[];
  respondents: string[];
  witnesses: string[];
  agencies_involved: string[];
} {
  const complainants: string[] = [];
  const respondents: string[] = [];
  const witnesses: string[] = [];
  const agenciesInvolved: string[] = [];

  // From explicit roles in entity_roles table
  for (const r of roles) {
    const role = (r.role || "").toLowerCase();
    const name = r.entityName || "";
    if (!name) continue;

    if (/complainant|plaintiff|petitioner|victim|claimant|reporter|filer/.test(role)) {
      if (!complainants.includes(name)) complainants.push(name);
    } else if (/respondent|defendant|accused|subject|target|violator/.test(role)) {
      if (!respondents.includes(name)) respondents.push(name);
    } else if (/witness|testif|deponent|informant/.test(role)) {
      if (!witnesses.includes(name)) witnesses.push(name);
    } else if (/agency|regulator|investigator|enforcer|inspector|auditor|commission|department|bureau|office|board/.test(role)) {
      if (!agenciesInvolved.includes(name)) agenciesInvolved.push(name);
    }
  }

  // From entity type classification
  for (const e of entities) {
    const type = (e.type || "").toLowerCase();
    if ((type === "agency" || type === "government" || type === "regulator") && !agenciesInvolved.includes(e.name)) {
      agenciesInvolved.push(e.name);
    }
  }

  return {
    complainants: complainants.slice(0, 20),
    respondents: respondents.slice(0, 20),
    witnesses: witnesses.slice(0, 10),
    agencies_involved: agenciesInvolved.slice(0, 10),
  };
}

// ─── Severity Scoring (T11) ───

/**
 * T11: Compute severity score (integer 1–10).
 * Derived ONLY from: victim_count, impact_amount, and complaint_category_weight.
 * Returns null if insufficient data (no victim count AND no amount).
 * No estimation. No inference.
 * 
 * Formula:
 *   base = category_weight (1-4)
 *   victim_factor = log10(victim_count) clamped to [0, 3]
 *   amount_factor = log10(amount / 1000) clamped to [0, 3]
 *   raw = base + victim_factor + amount_factor
 *   severity = round(raw * 10 / 10) clamped to [1, 10]
 */
function computeSeverity(
  victimCount: number | null,
  impactAmount: number | null,
  category: string
): number | null {
  // Null if insufficient data
  if (victimCount === null && (impactAmount === null || impactAmount <= 0)) return null;

  const categoryWeight = CATEGORY_WEIGHTS[category] || 1;
  let victimFactor = 0;
  let amountFactor = 0;

  if (victimCount !== null && victimCount > 0) {
    victimFactor = Math.min(3, Math.log10(victimCount));
  }
  if (impactAmount !== null && impactAmount > 0) {
    amountFactor = Math.min(3, Math.log10(impactAmount / 1000));
    if (amountFactor < 0) amountFactor = 0;
  }

  const raw = categoryWeight + victimFactor + amountFactor;
  const severity = Math.round(raw);
  return Math.max(1, Math.min(10, severity));
}

// ─── Evidence Extraction (T12) ───

/**
 * T12: Extract verbatim evidence quotes from document body.
 * Max 3 per document. Max 200 characters each.
 * From document body ONLY — no metadata, no headers.
 * Must be verbatim — no modification, no truncation mid-word.
 */
function extractEvidenceQuotes(
  textContent: string,
  claims: { claimText: string }[],
  flags: { description: string }[]
): string[] {
  const quotes: string[] = [];
  if (!textContent) return quotes;

  // Strip obvious headers/metadata from top of document
  // Headers are typically the first few lines before body content
  const lines = textContent.split("\n");
  let bodyStartIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    // Skip lines that look like metadata headers
    if (/^(Date|From|To|Subject|Re|CC|BCC|File|Case|Docket|Reference|Complaint\s+(?:No|Number|ID))[\s:]/i.test(line)) {
      bodyStartIdx = i + 1;
    } else if (line === "" && i < 5) {
      bodyStartIdx = i + 1;
    } else if (line.length > 0) {
      break;
    }
  }
  const bodyText = lines.slice(bodyStartIdx).join("\n");

  // Strategy 1: Extract sentences that contain key forensic indicators
  const forensicIndicators = [
    /(?:stated|testified|reported|alleged|claimed|complained|asserted)\s+(?:that\s+)?/i,
    /(?:according\s+to|as\s+(?:stated|reported|described)\s+(?:in|by))/i,
    /(?:the\s+(?:complaint|filing|report|document)\s+(?:states|indicates|describes|notes))/i,
  ];

  // Split body into sentences
  const sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [];
  
  for (const sentence of sentences) {
    if (quotes.length >= 3) break;
    const trimmed = sentence.trim();
    if (trimmed.length < 20 || trimmed.length > 200) continue;

    // Check if sentence contains forensic indicators
    for (const indicator of forensicIndicators) {
      if (indicator.test(trimmed)) {
        if (!quotes.includes(trimmed)) {
          quotes.push(trimmed);
        }
        break;
      }
    }
  }

  // Strategy 2: If fewer than 3, use claim text that appears verbatim in body
  if (quotes.length < 3) {
    for (const claim of claims) {
      if (quotes.length >= 3) break;
      const ct = (claim.claimText || "").trim();
      if (ct.length >= 20 && ct.length <= 200 && bodyText.includes(ct) && !quotes.includes(ct)) {
        quotes.push(ct);
      }
    }
  }

  // Strategy 3: If still fewer than 3, use flag descriptions that appear verbatim in body
  if (quotes.length < 3) {
    for (const flag of flags) {
      if (quotes.length >= 3) break;
      const desc = (flag.description || "").trim();
      if (desc.length >= 20 && desc.length <= 200 && bodyText.includes(desc) && !quotes.includes(desc)) {
        quotes.push(desc);
      }
    }
  }

  // Enforce max 200 chars — truncate at last word boundary
  return quotes.map(q => {
    if (q.length <= 200) return q;
    const truncated = q.substring(0, 200);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 100 ? truncated.substring(0, lastSpace) : truncated;
  });
}

// ─── Core Extraction Function ───

export interface SignalExtractionRecord {
  doc_id: number;
  // Original 6 groups
  entities: { people: string[]; companies: string[]; agencies: string[] };
  complaint: { type: string; description: string; category: string; raw_category: string };
  location: { city: string | null; county: string | null; state: string | null };
  timeline: { event_date: string | null; filed_date: string | null };
  signals: { fingerprint: string; keywords: string[] };
  source: { source_id: string; dataset: string };
  // New 5 groups
  impact: {
    victim_count: number | null;
    impact_amount: number | null;
    impact_scope: "individual" | "local" | "regional" | "statewide" | "national" | null;
    amounts_found: number[];
  };
  legal: {
    statutes: string[];
    violations: string[];
    regulatory_refs: string[];
  };
  involvement: {
    complainants: string[];
    respondents: string[];
    witnesses: string[];
    agencies_involved: string[];
  };
  severity: {
    score: number | null; // integer 1-10 or null
    victim_count_used: number | null;
    amount_used: number | null;
    category_weight: number;
  };
  evidence: {
    quotes: string[]; // max 3, max 200 chars each, verbatim from body
  };
}

/**
 * Extract structured, normalized data from a document's Pass 1+2 output.
 * 11 field groups. Lightweight extraction only. No premature inference.
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
  const [rolesRows] = await drizzleDb.execute(
    sql`SELECT er.entityId, e.name as entity_name, er.role, er.description 
        FROM entity_roles er 
        JOIN entities e ON e.id = er.entityId 
        WHERE e.documentId = ${documentId}`
  );

  const entities = Array.isArray(entitiesRows) ? entitiesRows as any[] : [];
  const claims = Array.isArray(claimsRows) ? claimsRows as any[] : [];
  const flags = Array.isArray(flagsRows) ? flagsRows as any[] : [];
  const doc = Array.isArray(docRow) && docRow.length > 0 ? (docRow as any[])[0] : null;
  const caseInfo = Array.isArray(caseRow) && caseRow.length > 0 ? (caseRow as any[])[0] : null;
  const roles = Array.isArray(rolesRows) ? rolesRows as any[] : [];

  const textContent = doc?.textContent || "";
  const allText = `${textContent} ${claims.map((c: any) => c.claimText || "").join(" ")} ${flags.map((f: any) => f.description || "").join(" ")}`;

  // ── T1: Classify entities ──
  const people: string[] = [];
  const companies: string[] = [];
  const agenciesList: string[] = [];
  for (const e of entities) {
    const name = (e.name || "").trim();
    const type = (e.type || "").toLowerCase();
    if (type === "person" || type === "individual") people.push(name);
    else if (type === "company" || type === "organization" || type === "corporation") companies.push(normalizeCompany(name));
    else if (type === "agency" || type === "government" || type === "regulator") agenciesList.push(name);
    else people.push(name);
  }

  // ── T2: Extract complaint info ──
  const primaryClaim = claims[0] || {};
  const complaintType = primaryClaim.claimType || flags[0]?.flagType || "";
  const complaintDescription = primaryClaim.claimText || flags[0]?.description || "";
  const rawCategory = caseInfo?.domain || "";
  const category = categorizeComplaint(rawCategory, complaintDescription);

  // ── T3: Extract location ──
  let city: string | null = null;
  let county: string | null = null;
  let state: string | null = null;
  const statePattern = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i;
  const stateMatch = textContent.match(statePattern);
  if (stateMatch) state = normalizeState(stateMatch[1]);
  const countyPattern = /(\w[\w\s]*?)\s+County/i;
  const countyMatch = textContent.match(countyPattern);
  if (countyMatch) county = countyMatch[1].trim();

  // ── T4: Timeline ──
  const eventDate = normalizeDate(null);
  const filedDate = normalizeDate(doc?.createdAt ? new Date(Number(doc.createdAt)).toISOString() : null);

  // ── T5: Fingerprint + keywords ──
  const primaryCompany = companies[0] || "";
  const fingerprint = computeFingerprint(primaryCompany, complaintType, state || "");
  const keywords: string[] = [];
  for (const f of flags) { if (f.flagType) keywords.push(f.flagType.toLowerCase()); }
  for (const c of claims) { if (c.claimType) keywords.push(c.claimType.toLowerCase()); }
  const uniqueKeywords = [...new Set(keywords)];

  // ── T6-T7: Impact extraction ──
  const amounts = extractAmounts(allText);
  const victimCount = extractVictimCount(allText);
  const impactAmount = amounts.length > 0 ? Math.max(...amounts) : null;
  const impactScope = determineImpactScope(allText, state, victimCount);

  // ── T9: Legal extraction ──
  const legal = extractLegalReferences(allText);

  // ── T10: Involvement classification ──
  const involvement = classifyInvolvement(
    entities.map((e: any) => ({ name: e.name || "", type: e.type || "" })),
    roles,
    textContent
  );

  // ── T11: Severity scoring ──
  const severityScore = computeSeverity(victimCount, impactAmount, category);
  const categoryWeight = CATEGORY_WEIGHTS[category] || 1;

  // ── T12: Evidence quotes ──
  const evidenceQuotes = extractEvidenceQuotes(textContent, claims, flags);

  const record: SignalExtractionRecord = {
    doc_id: documentId,
    entities: { people, companies, agencies: agenciesList },
    complaint: { type: complaintType, description: complaintDescription, category, raw_category: rawCategory },
    location: { city, county, state },
    timeline: { event_date: eventDate, filed_date: filedDate },
    signals: { fingerprint, keywords: uniqueKeywords },
    source: { source_id: String(documentId), dataset: caseInfo?.name || "" },
    impact: { victim_count: victimCount, impact_amount: impactAmount, impact_scope: impactScope, amounts_found: amounts },
    legal,
    involvement,
    severity: { score: severityScore, victim_count_used: victimCount, amount_used: impactAmount, category_weight: categoryWeight },
    evidence: { quotes: evidenceQuotes },
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

  // Persist all 11 field groups
  await drizzleDb.insert(signalExtractions).values({
    docId: record.doc_id,
    caseId,
    // Entities
    entitiesPeople: JSON.stringify(record.entities.people),
    entitiesCompanies: JSON.stringify(record.entities.companies),
    entitiesAgencies: JSON.stringify(record.entities.agencies),
    // Complaint
    complaintType: record.complaint.type || null,
    complaintDescription: record.complaint.description || null,
    complaintCategory: record.complaint.category as any,
    complaintRawCategory: record.complaint.raw_category || null,
    // Location
    locationCity: record.location.city,
    locationCounty: record.location.county,
    locationState: record.location.state,
    // Timeline
    eventDate: record.timeline.event_date,
    filedDate: record.timeline.filed_date,
    // Signals
    fingerprint: record.signals.fingerprint,
    keywords: JSON.stringify(record.signals.keywords),
    // Source
    sourceId: record.source.source_id,
    dataset: record.source.dataset,
    // Impact (new)
    impactVictimCount: record.impact.victim_count,
    impactAmount: record.impact.impact_amount ? String(record.impact.impact_amount) : null,
    impactScope: record.impact.impact_scope,
    impactAmountsFound: JSON.stringify(record.impact.amounts_found),
    // Legal (new)
    legalStatutes: JSON.stringify(record.legal.statutes),
    legalViolations: JSON.stringify(record.legal.violations),
    legalRegulatoryRefs: JSON.stringify(record.legal.regulatory_refs),
    // Involvement (new)
    involvementComplainants: JSON.stringify(record.involvement.complainants),
    involvementRespondents: JSON.stringify(record.involvement.respondents),
    involvementWitnesses: JSON.stringify(record.involvement.witnesses),
    involvementAgencies: JSON.stringify(record.involvement.agencies_involved),
    // Severity (new)
    severityScore: record.severity.score,
    severityVictimCountUsed: record.severity.victim_count_used,
    severityAmountUsed: record.severity.amount_used ? String(record.severity.amount_used) : null,
    severityCategoryWeight: record.severity.category_weight,
    // Evidence (new)
    evidenceQuotes: JSON.stringify(record.evidence.quotes),
    // Metadata
    extractedAt: Date.now(),
  });

  console.log(`[SignalExtraction] Extracted doc ${documentId} → fingerprint: ${record.signals.fingerprint.substring(0, 12)}... severity: ${record.severity.score ?? "null"} evidence: ${record.evidence.quotes.length} quotes`);
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
