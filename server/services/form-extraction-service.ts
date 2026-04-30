// FormSignalExtractionEngine stub — synchronous, typed result
interface ExtractionEngineResult {
  proto_forms: any[];
  workflow_counts: Record<string, number>;
  stats: { avg_confidence: number; by_domain: Record<string, number>; by_workflow: Record<string, number> };
  missing_coverage: Record<string, string[]>;
}
class FormSignalExtractionEngine {
  extract(_doc: string): ExtractionEngineResult {
    return { proto_forms: [], workflow_counts: {}, stats: { avg_confidence: 0, by_domain: {}, by_workflow: {} }, missing_coverage: {} };
  }
}
/**
 * FORM EXTRACTION SERVICE
 * 
 * Integrates FormSignalExtractionEngine v2.0 with the interpretation layer.
 * Extracts form signals from case documents and populates confidence scores.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { documents } from "../../drizzle/schema";

// Import the FormSignalExtractionEngine
// FormSignalExtractionEngine v2.0 - form signal extraction
// const FormSignalExtractionEngine = require("../form-signal-extraction-engine-v2.js");

export interface ExtractedForm {
  form_name: string;
  submission_url: string | null;
  phone_number: string | null;
  mailing_address: string | null;
  submission_method: "online" | "phone" | "mail" | "unknown";
  confidence_score: number;
  agency_detected: string | null;
  workflow_hint: string | null;
  jurisdiction: string | null;
}

export interface FormExtractionResult {
  caseId: number;
  totalFormsExtracted: number;
  topForms: ExtractedForm[];
  workflowDistribution: Record<string, number>;
  averageConfidence: number;
  stats: {
    by_domain: Record<string, number>;
    by_workflow: Record<string, number>;
    missing_coverage: Record<string, string[]>;
  };
}

/**
 * Extract forms from all case documents
 */
export async function extractFormsFromCase(caseId: number): Promise<FormExtractionResult> {
  // Fetch all documents for the case
  const caseDocuments = await db
    .select()
    .from(documents)
    .where(eq(documents.caseId, caseId));

  if (caseDocuments.length === 0) {
    return {
      caseId,
      totalFormsExtracted: 0,
      topForms: [],
      workflowDistribution: {},
      averageConfidence: 0,
      stats: {
        by_domain: {},
        by_workflow: {},
        missing_coverage: {},
      },
    };
  }

  // Combine all document content
  const combinedContent = caseDocuments
    .map((doc) => (doc as any).extractedText || (doc as any).content || "")
    .join("\n\n");

  // Initialize extraction engine
  const engine = new FormSignalExtractionEngine();

  // Extract forms from combined content
  const extractionResult = engine.extract(combinedContent);

  // Map extracted forms to our interface
  const extractedForms: ExtractedForm[] = extractionResult.proto_forms.map(
    (form: any) => ({
      form_name: form.form_name || "Unknown Form",
      submission_url: form.submission_url || null,
      phone_number: form.phone_number || null,
      mailing_address: form.mailing_address || null,
      submission_method: form.submission_method || "unknown",
      confidence_score: form.confidence_score || 0,
      agency_detected: form.agency_detected || null,
      workflow_hint: form.workflow_hint || null,
      jurisdiction: form.jurisdiction || null,
    })
  );

  // Get top forms (confidence >= 3)
  const topForms = extractedForms.filter((f) => f.confidence_score >= 3);

  return {
    caseId,
    totalFormsExtracted: extractedForms.length,
    topForms,
    workflowDistribution: extractionResult.workflow_counts || {},
    averageConfidence: extractionResult.stats?.avg_confidence || 0,
    stats: {
      by_domain: extractionResult.stats?.by_domain || {},
      by_workflow: extractionResult.stats?.by_workflow || {},
      missing_coverage: extractionResult.missing_coverage || {},
    },
  };
}

/**
 * Calculate element confidence for a claim based on extracted forms
 * Returns a percentage (0-100) indicating how many required elements are present
 */
export function calculateElementConfidence(
  claimText: string,
  extractedForms: ExtractedForm[]
): number {
  if (extractedForms.length === 0) return 0;

  // Required elements for a strong claim
  const requiredElements = {
    hasURL: false,
    hasPhone: false,
    hasAddress: false,
    hasAgency: false,
    hasWorkflow: false,
  };

  // Check if any extracted form has these elements
  for (const form of extractedForms) {
    if (form.submission_url) requiredElements.hasURL = true;
    if (form.phone_number) requiredElements.hasPhone = true;
    if (form.mailing_address) requiredElements.hasAddress = true;
    if (form.agency_detected) requiredElements.hasAgency = true;
    if (form.workflow_hint) requiredElements.hasWorkflow = true;
  }

  // Calculate confidence as percentage of elements present
  const elementCount = Object.values(requiredElements).filter((v) => v).length;
  const totalElements = Object.keys(requiredElements).length;

  return Math.round((elementCount / totalElements) * 100);
}

/**
 * Get missing elements for a claim
 */
export function getMissingElements(
  extractedForms: ExtractedForm[]
): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];

  // Check for missing required elements
  const hasURL = extractedForms.some((f) => f.submission_url);
  const hasPhone = extractedForms.some((f) => f.phone_number);
  const hasAddress = extractedForms.some((f) => f.mailing_address);
  const hasAgency = extractedForms.some((f) => f.agency_detected);

  if (!hasURL) required.push("Submission URL");
  if (!hasPhone) optional.push("Phone Number");
  if (!hasAddress) optional.push("Mailing Address");
  if (!hasAgency) required.push("Agency Identification");

  return { required, optional };
}

/**
 * Generate "How to Satisfy" hints for missing elements
 */
export function generateSatisfactionHints(
  missingElements: { required: string[]; optional: string[] }
): Record<string, string> {
  const hints: Record<string, string> = {
    "Submission URL":
      "Find the official government website where you can submit your claim or appeal. Look for URLs ending in .gov or official agency portals.",
    "Phone Number":
      "Locate the primary contact phone number for the agency. Check official government websites or call 411 for agency phone numbers.",
    "Mailing Address":
      "Find the official mailing address for submitting documents. This is typically found on agency websites or in official correspondence.",
    "Agency Identification":
      "Identify the specific government agency responsible for handling your claim. This helps determine the correct submission pathway.",
    "Time records":
      "Upload timesheets, calendar entries, or contemporaneous notes showing hours worked.",
    "Witness testimony":
      "Obtain written statements from coworkers who can verify your work schedule.",
    "Email communications":
      "Provide emails or messages discussing work assignments or hours.",
    "Bank statements showing no deposits":
      "Provide 6 months of bank statements showing no deposits from employer.",
    "Employer payment records":
      "Request payroll records from employer through discovery or FOIA.",
  };

  const allMissing = [...missingElements.required, ...missingElements.optional];
  const result: Record<string, string> = {};

  for (const element of allMissing) {
    result[element] = hints[element] || `Provide evidence or documentation for: ${element}`;
  }

  return result;
}



// ============================================================
