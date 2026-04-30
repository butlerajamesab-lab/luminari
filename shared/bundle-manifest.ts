/**
 * Offline Intake Bundle — Manifest Schema
 *
 * This file defines the complete capability surface of the offline intake bundle.
 * All fields are documented here, even those implemented in later phases.
 *
 * Phase A (current): Core intake, top 5 domains, manual sync, safety features
 * Phase B (future):  AES-GCM encryption, all 42 domains, storage safeguards
 * Phase C (future):  Emergency alert, auto-sync, bundle versioning, session continuity
 */

// ─── Domain Modules ───
// Phase A: top 5 domains
export const PHASE_A_DOMAINS = [
  "domestic_violence",
  "custody",
  "insurance",
  "housing",
  "workplace",
] as const;

// Full domain list (42 pipeline types) — Phase B activates all
export const ALL_DOMAINS = [
  "domestic_violence", "custody", "insurance", "housing", "workplace",
  "consumer", "disability", "medicaid", "snap", "veterans", "unemployment",
  "nursing", "guardianship", "elderabuse", "immigration", "childwelfare",
  "education", "section8", "juvenile", "workerscomp", "wrongfulconviction",
  "debtcollection", "policemisconduct", "bankruptcy", "environmental",
  "hoa", "taxdispute", "fostercare", "medmalpractice", "predatorylending",
  "whistleblower", "nonprofitcompliance", "marketconcentration",
  "agricultureexploitation", "icwa", "mmiw", "treatyrights", "triballand",
  "tribalenrollment", "tribalhousing", "tribalsovereignty", "medical", "other",
] as const;

// Maps bundle domain IDs to Luminari pipelineType values
export const DOMAIN_TO_PIPELINE: Record<string, string> = {
  domestic_violence: "custody", // DV cases use custody pipeline (family law)
  custody: "custody",
  insurance: "insurance",
  housing: "housing",
  workplace: "workplace",
  consumer: "consumer",
  disability: "disability",
  medicaid: "medicaid",
  snap: "snap",
  veterans: "veterans",
  unemployment: "unemployment",
  nursing: "nursing",
  guardianship: "guardianship",
  elderabuse: "elderabuse",
  immigration: "immigration",
  childwelfare: "childwelfare",
  education: "education",
  section8: "section8",
  juvenile: "juvenile",
  workerscomp: "workerscomp",
  wrongfulconviction: "wrongfulconviction",
  debtcollection: "debtcollection",
  policemisconduct: "policemisconduct",
  bankruptcy: "bankruptcy",
  environmental: "environmental",
  hoa: "hoa",
  taxdispute: "taxdispute",
  fostercare: "fostercare",
  medmalpractice: "medmalpractice",
  predatorylending: "predatorylending",
  whistleblower: "whistleblower",
  nonprofitcompliance: "nonprofitcompliance",
  marketconcentration: "marketconcentration",
  agricultureexploitation: "agricultureexploitation",
  icwa: "icwa",
  mmiw: "mmiw",
  treatyrights: "treatyrights",
  triballand: "triballand",
  tribalenrollment: "tribalenrollment",
  tribalhousing: "tribalhousing",
  tribalsovereignty: "tribalsovereignty",
  medical: "medical",
  other: "other",
};

// Maps bundle domain IDs to human-readable labels
export const DOMAIN_LABELS: Record<string, string> = {
  domestic_violence: "Domestic Violence",
  custody: "Custody / Family Court",
  insurance: "Insurance Claim Denial",
  housing: "Housing / Landlord Dispute",
  workplace: "Workplace Retaliation",
  consumer: "Consumer Protection",
  disability: "Disability Benefits (SSI/SSDI)",
  medicaid: "Medicaid / Medicare",
  snap: "Food Assistance (SNAP/WIC)",
  veterans: "Veterans Benefits (VA)",
  unemployment: "Unemployment Benefits",
  nursing: "Nursing Home / Assisted Living",
  guardianship: "Guardianship / Conservatorship",
  elderabuse: "Elder Abuse Investigation",
  immigration: "Immigration & Asylum",
  childwelfare: "Child Welfare / CPS",
  education: "Education & IEP/504",
  section8: "Tenant Rights / Section 8",
  juvenile: "Juvenile Justice",
  workerscomp: "Workers' Compensation",
  wrongfulconviction: "Wrongful Conviction",
  debtcollection: "Debt Collection Defense",
  policemisconduct: "Police Misconduct",
  bankruptcy: "Bankruptcy",
  environmental: "Environmental Justice",
  hoa: "HOA Disputes",
  taxdispute: "Tax Disputes",
  fostercare: "Foster Care Records",
  medmalpractice: "Medical Malpractice",
  predatorylending: "Predatory Lending",
  whistleblower: "Whistleblower Retaliation",
  nonprofitcompliance: "Nonprofit Compliance",
  marketconcentration: "Market Concentration & Antitrust",
  agricultureexploitation: "Agricultural Exploitation",
  icwa: "ICWA / Tribal Child Welfare",
  mmiw: "Missing & Murdered Indigenous Persons",
  treatyrights: "Treaty Rights",
  triballand: "Land & Trust",
  tribalenrollment: "Tribal Enrollment",
  tribalhousing: "Tribal Housing & Benefits",
  tribalsovereignty: "Sovereignty & Jurisdiction",
  medical: "Medical Records Review",
  other: "General Advocacy",
};

// ─── Sync Modes ───
export type SyncMode =
  | "manual"       // Phase A: user presses "Upload Case" when ready
  | "auto"         // Phase C: bundle uploads when connectivity appears
  | "emergency";   // Phase C: emergency alert to hotlines/webhooks

// ─── User Modes ───
export type UserMode =
  | "independent"        // No advocate, case uploads to user's own account
  | "advocate_supported" // Advocate contact stored in manifest, share after sync
  | "emergency";         // Minimal intake, emergency alert only (Phase C)

// ─── Timeline Entry ───
export interface BundleTimelineEntry {
  id: string;           // Client-generated UUID
  date: string;         // ISO date string (YYYY-MM-DD) or partial date
  title: string;
  description: string;
  source: "intake_bundle"; // Always "intake_bundle" for bundle-originated events
}

// ─── Person Entry ───
export interface BundlePerson {
  id: string;           // Client-generated UUID
  name: string;
  role: string;         // e.g., "treating_physician", "caseworker", "opposing_party"
  relationship: string; // Free-text description of relationship to user
  contact?: string;     // Optional phone/email
  notes?: string;       // Optional notes about this person
}

// ─── Attachment Entry ───
export interface BundleAttachment {
  id: string;           // Client-generated UUID
  filename: string;
  mimeType: string;
  size: number;         // Bytes
  sha256: string;       // Hex-encoded SHA-256 hash of file content
  capturedAt: number;   // UTC timestamp (ms)
  notes?: string;       // User's notes about this file
  // The actual file bytes are stored separately (IndexedDB blob / .luminari ZIP entry)
  // Not included in the manifest JSON — transmitted as multipart form data during sync
}

// ─── Evidence Note ───
export interface BundleEvidenceNote {
  id: string;           // Client-generated UUID
  content: string;      // Free-text note
  attachmentId?: string; // Optional link to a specific attachment
  createdAt: number;    // UTC timestamp (ms)
}

// ─── Advocate Info (Phase A: metadata only, linking happens after sync) ───
export interface BundleAdvocateInfo {
  name?: string;
  organization?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

// ─── Case Context ───
export interface BundleCaseContext {
  name: string;                    // Case name (user-provided or auto-generated)
  description: string;             // Narrative description from guided intake
  primaryDomain: string;           // Primary domain ID (e.g., "domestic_violence")
  additionalDomains: string[];     // Additional activated domain modules
  situationNotes: string;          // Free-text from guided intake conversation
}

// ─── Encryption Metadata (Phase B) ───
export interface BundleEncryptionMeta {
  version: number;                 // Encryption scheme version (1 = AES-GCM)
  algorithm: "AES-GCM";
  keyDerivation: "PBKDF2";
  iterations: number;              // PBKDF2 iterations (recommended: 600000)
  saltBase64: string;              // Base64-encoded salt
  ivBase64: string;                // Base64-encoded initialization vector
  // When encryption is active, all other manifest fields are encrypted
  // The encrypted payload replaces the plaintext fields
}

// ─── Emergency Alert Payload (Phase C) ───
export interface BundleEmergencyAlert {
  situationType: string;           // Domain ID
  location?: string;               // Free-text location
  contactName?: string;
  contactPhone?: string;
  message?: string;                // Brief message
  timestamp: number;               // UTC timestamp (ms)
}

// ─── Full Bundle Manifest ───
export interface BundleManifest {
  // ── Header ──
  bundleVersion: string;           // Semver (e.g., "1.0.0")
  luminariVersion: string;         // Luminari engine version at bundle generation time
  createdAt: number;               // UTC timestamp (ms) — when bundle was first used
  updatedAt: number;               // UTC timestamp (ms) — last modification
  manifestHash: string;            // SHA-256 of all content fields (integrity check)

  // ── User Mode ──
  userMode: UserMode;

  // ── Case Context ──
  caseContext: BundleCaseContext;

  // ── Structured Data ──
  timeline: BundleTimelineEntry[];
  people: BundlePerson[];
  attachments: BundleAttachment[];
  evidenceNotes: BundleEvidenceNote[];

  // ── Advocate (optional) ──
  advocateInfo?: BundleAdvocateInfo;

  // ── Sync Configuration ──
  syncMode: SyncMode;

  // ── Phase B: Encryption ──
  encryption?: BundleEncryptionMeta | null;

  // ── Phase C: Emergency ──
  emergencyAlert?: BundleEmergencyAlert | null;
}

// ─── Validation ───

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest must be a non-null object"], warnings: [] };
  }

  const m = manifest as Record<string, unknown>;

  // Required header fields
  if (typeof m.bundleVersion !== "string") errors.push("Missing or invalid bundleVersion");
  if (typeof m.createdAt !== "number") errors.push("Missing or invalid createdAt timestamp");
  if (typeof m.updatedAt !== "number") errors.push("Missing or invalid updatedAt timestamp");
  if (typeof m.manifestHash !== "string") errors.push("Missing or invalid manifestHash");

  // User mode
  if (!["independent", "advocate_supported", "emergency"].includes(m.userMode as string)) {
    errors.push("Invalid userMode: must be 'independent', 'advocate_supported', or 'emergency'");
  }

  // Case context
  if (!m.caseContext || typeof m.caseContext !== "object") {
    errors.push("Missing caseContext object");
  } else {
    const ctx = m.caseContext as Record<string, unknown>;
    if (typeof ctx.name !== "string" || ctx.name.length === 0) errors.push("caseContext.name is required");
    if (typeof ctx.primaryDomain !== "string") errors.push("caseContext.primaryDomain is required");
    if (!Array.isArray(ctx.additionalDomains)) errors.push("caseContext.additionalDomains must be an array");

    // Validate domain IDs
    const allDomains = [ctx.primaryDomain, ...(Array.isArray(ctx.additionalDomains) ? ctx.additionalDomains : [])];
    for (const d of allDomains) {
      if (typeof d === "string" && !DOMAIN_TO_PIPELINE[d]) {
        warnings.push(`Unknown domain "${d}" — will default to "other" pipeline`);
      }
    }
  }

  // Structured data arrays
  if (!Array.isArray(m.timeline)) errors.push("timeline must be an array");
  if (!Array.isArray(m.people)) errors.push("people must be an array");
  if (!Array.isArray(m.attachments)) errors.push("attachments must be an array");
  if (!Array.isArray(m.evidenceNotes)) errors.push("evidenceNotes must be an array");

  // Validate attachments
  if (Array.isArray(m.attachments)) {
    for (let i = 0; i < (m.attachments as unknown[]).length; i++) {
      const att = (m.attachments as Record<string, unknown>[])[i];
      if (!att || typeof att !== "object") { errors.push(`attachments[${i}] is invalid`); continue; }
      if (typeof att.filename !== "string") errors.push(`attachments[${i}].filename is required`);
      if (typeof att.sha256 !== "string") errors.push(`attachments[${i}].sha256 is required`);
      if (typeof att.size !== "number") errors.push(`attachments[${i}].size is required`);
    }
  }

  // Sync mode
  if (!["manual", "auto", "emergency"].includes(m.syncMode as string)) {
    errors.push("Invalid syncMode: must be 'manual', 'auto', or 'emergency'");
  }

  // Warnings for Phase B/C features referenced but not yet supported
  if (m.encryption) warnings.push("Encryption metadata present but not yet supported (Phase B)");
  if (m.emergencyAlert) warnings.push("Emergency alert present but not yet supported (Phase C)");
  if (m.syncMode === "auto") warnings.push("Auto-sync not yet supported (Phase C), will use manual sync");

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Manifest Hash Computation ───
// The hash covers: caseContext + timeline + people + attachments (metadata only) + evidenceNotes
// File bytes are NOT included in the manifest hash — each attachment has its own sha256
export function computeManifestHashPayload(manifest: BundleManifest): string {
  const payload = {
    caseContext: manifest.caseContext,
    timeline: manifest.timeline,
    people: manifest.people,
    attachments: manifest.attachments.map(a => ({
      id: a.id,
      filename: a.filename,
      sha256: a.sha256,
      size: a.size,
    })),
    evidenceNotes: manifest.evidenceNotes,
    userMode: manifest.userMode,
  };
  // Use a replacer that sorts keys at every level for deterministic output
  return JSON.stringify(payload, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted: Record<string, unknown>, k) => {
        sorted[k] = (value as Record<string, unknown>)[k];
        return sorted;
      }, {});
    }
    return value;
  });
}
