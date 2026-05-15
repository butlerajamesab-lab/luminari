/**
 * Evidence Mapping Service
 * Scans case evidence and extracts structured values to auto-fill
 * settlement calculator variables and template placeholders.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Evidence → Calculator Variable Mappings ───
const EVIDENCE_TYPE_MAPPINGS: Record<string, {
  calculatorVars: Record<string, string[]>;
  templatePlaceholders: Record<string, string[]>;
}> = {
  payroll_record: {
    calculatorVars: {
      unpaid_wages: ["amount", "total_owed", "wages_owed", "unpaid_amount"],
      overtime_hours: ["overtime_hours", "ot_hours", "extra_hours"],
      regular_rate: ["hourly_rate", "rate", "pay_rate", "wage_rate"],
      daily_rate: ["daily_rate", "day_rate"],
      days_unpaid: ["days_late", "days_overdue", "days_unpaid"],
    },
    templatePlaceholders: {
      employee_name: ["employee_name", "worker_name", "name"],
      employer_name: ["employer_name", "company_name", "employer"],
      employment_start_date: ["start_date", "hire_date"],
      employment_end_date: ["end_date", "termination_date"],
      job_title: ["job_title", "position", "title"],
    },
  },
  lease_agreement: {
    calculatorVars: {
      deposit_amount: ["deposit", "security_deposit", "deposit_amount"],
      rent_amount: ["rent", "monthly_rent", "rent_amount"],
      actual_damages: ["damages", "actual_damages"],
    },
    templatePlaceholders: {
      tenant_name: ["tenant_name", "renter_name", "lessee"],
      landlord_name: ["landlord_name", "property_owner", "lessor"],
      property_address: ["property_address", "address", "rental_address"],
      lease_start_date: ["lease_start", "start_date", "move_in_date"],
      lease_end_date: ["lease_end", "end_date", "move_out_date"],
    },
  },
  receipt: {
    calculatorVars: {
      actual_loss: ["amount", "total", "purchase_amount", "amount_paid"],
      purchase_amount: ["amount", "total", "purchase_amount"],
    },
    templatePlaceholders: {
      purchase_date: ["date", "purchase_date", "transaction_date"],
      merchant_name: ["merchant", "seller", "vendor", "store"],
      product_description: ["description", "item", "product"],
    },
  },
  medical_record: {
    calculatorVars: {
      actual_damages: ["total_charges", "amount", "medical_costs"],
      emotional_distress: ["emotional_distress_amount", "pain_suffering"],
    },
    templatePlaceholders: {
      patient_name: ["patient_name", "name"],
      provider_name: ["provider", "doctor", "hospital"],
      treatment_date: ["date", "treatment_date", "visit_date"],
      diagnosis: ["diagnosis", "condition"],
    },
  },
  violation_notice: {
    calculatorVars: {
      violation_count: ["count", "violation_count", "number_of_violations"],
      days_in_violation: ["days", "duration_days", "days_in_violation"],
    },
    templatePlaceholders: {
      violation_date: ["date", "violation_date", "notice_date"],
      violation_type: ["type", "violation_type", "category"],
      issuing_agency: ["agency", "issuer", "authority"],
    },
  },
  contract: {
    calculatorVars: {
      baseDamages: ["contract_value", "amount", "total_value"],
    },
    templatePlaceholders: {
      contract_date: ["date", "effective_date", "signed_date"],
      party_name: ["party_a", "first_party", "client_name"],
      counterparty_name: ["party_b", "second_party", "vendor_name"],
    },
  },
  bank_statement: {
    calculatorVars: {
      actual_loss: ["amount", "total_debited", "unauthorized_charges"],
      actual_damages: ["amount", "total_debited"],
    },
    templatePlaceholders: {
      account_holder: ["account_holder", "name"],
      bank_name: ["bank", "institution"],
    },
  },
  correspondence: {
    calculatorVars: {},
    templatePlaceholders: {
      sender_name: ["from", "sender", "author"],
      recipient_name: ["to", "recipient", "addressee"],
      correspondence_date: ["date", "sent_date"],
    },
  },
};

// Broader type aliases for evidence types that map to the above
const TYPE_ALIASES: Record<string, string> = {
  payroll: "payroll_record",
  pay_stub: "payroll_record",
  paystub: "payroll_record",
  wage_record: "payroll_record",
  employment_record: "payroll_record",
  lease: "lease_agreement",
  rental_agreement: "lease_agreement",
  tenancy_agreement: "lease_agreement",
  payment_receipt: "receipt",
  purchase_receipt: "receipt",
  invoice: "receipt",
  medical_bill: "medical_record",
  medical_report: "medical_record",
  hospital_record: "medical_record",
  citation: "violation_notice",
  infraction: "violation_notice",
  notice_of_violation: "violation_notice",
  agreement: "contract",
  service_contract: "contract",
  bank_record: "bank_statement",
  financial_statement: "bank_statement",
  letter: "correspondence",
  email: "correspondence",
  notice: "correspondence",
};

export interface DetectedEvidence {
  evidenceId: number;
  evidenceType: string;
  title: string;
  sourceDate: number | null;
  detectedValues: {
    calculatorVars: Record<string, number>;
    templatePlaceholders: Record<string, string>;
  };
  confidence: "high" | "medium" | "low";
}

export interface AutoFillResult {
  caseId: number;
  claimType: string;
  detectedEvidence: DetectedEvidence[];
  suggestedCalculatorVars: Record<string, number>;
  suggestedPlaceholders: Record<string, string>;
  totalEvidenceScanned: number;
  totalValuesDetected: number;
}

/**
 * Scan case evidence and extract structured values for auto-fill
 */
export async function scanCaseEvidence(
  caseId: number,
  claimType: string
): Promise<AutoFillResult> {
  // Fetch evidence items for this case
  const [evidenceRows] = await db.execute(
    sql`SELECT id, caseId, evidenceType, title, description, sourceName, sourceDate, metadata
        FROM evidence_items WHERE caseId = ${caseId} ORDER BY createdAt DESC`
  );
  const items = evidenceRows as unknown as any[];

  // Also check claims table for claim-specific data
  const [claimRows] = await db.execute(
    sql`SELECT id, claimType, claimText, entitiesInvolved FROM claims WHERE caseId = ${caseId}`
  );
  const claims = claimRows as unknown as any[];

  const detectedEvidence: DetectedEvidence[] = [];
  const mergedCalcVars: Record<string, number> = {};
  const mergedPlaceholders: Record<string, string> = {};
  let totalValuesDetected = 0;

  for (const item of items) {
    const detected = extractFromEvidence(item, claimType);
    if (detected) {
      detectedEvidence.push(detected);
      // Merge into combined results (first value wins for each key)
      for (const [k, v] of Object.entries(detected.detectedValues.calculatorVars)) {
        if (!(k in mergedCalcVars)) {
          mergedCalcVars[k] = v;
          totalValuesDetected++;
        }
      }
      for (const [k, v] of Object.entries(detected.detectedValues.templatePlaceholders)) {
        if (!(k in mergedPlaceholders)) {
          mergedPlaceholders[k] = v;
          totalValuesDetected++;
        }
      }
    }
  }

  // Extract from claims
  for (const claim of claims) {
    const entities = parseJson(claim.entitiesInvolved);
    if (entities && typeof entities === "object") {
      for (const [key, val] of Object.entries(entities as Record<string, any>)) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "_");
        if (typeof val === "number" && !(normalizedKey in mergedCalcVars)) {
          mergedCalcVars[normalizedKey] = val;
          totalValuesDetected++;
        } else if (typeof val === "string" && !(normalizedKey in mergedPlaceholders)) {
          mergedPlaceholders[normalizedKey] = val;
          totalValuesDetected++;
        }
      }
    }
  }

  return {
    caseId,
    claimType,
    detectedEvidence,
    suggestedCalculatorVars: mergedCalcVars,
    suggestedPlaceholders: mergedPlaceholders,
    totalEvidenceScanned: items.length,
    totalValuesDetected,
  };
}

/**
 * Extract structured values from a single evidence item
 */
function extractFromEvidence(item: any, claimType: string): DetectedEvidence | null {
  const rawType = (item.evidenceType || "").toLowerCase().replace(/[\s-]+/g, "_");
  const mappedType = TYPE_ALIASES[rawType] || rawType;
  const mapping = EVIDENCE_TYPE_MAPPINGS[mappedType];

  const calcVars: Record<string, number> = {};
  const placeholders: Record<string, string> = {};
  let confidence: "high" | "medium" | "low" = "low";

  // Parse metadata JSON
  const metadata = parseJson(item.metadata);

  if (mapping && metadata && typeof metadata === "object") {
    // Extract calculator variables
    for (const [varName, sourceKeys] of Object.entries(mapping.calculatorVars)) {
      for (const key of sourceKeys) {
        const val = findValue(metadata, key);
        if (val !== null && typeof val === "number" && val > 0) {
          calcVars[varName] = val;
          break;
        }
        if (val !== null && typeof val === "string") {
          const parsed = parseFloat(val.replace(/[$,]/g, ""));
          if (!isNaN(parsed) && parsed > 0) {
            calcVars[varName] = parsed;
            break;
          }
        }
      }
    }

    // Extract template placeholders
    for (const [phName, sourceKeys] of Object.entries(mapping.templatePlaceholders)) {
      for (const key of sourceKeys) {
        const val = findValue(metadata, key);
        if (val !== null && typeof val === "string" && val.trim()) {
          placeholders[phName] = val.trim();
          break;
        }
      }
    }

    const totalFound = Object.keys(calcVars).length + Object.keys(placeholders).length;
    if (totalFound >= 3) confidence = "high";
    else if (totalFound >= 1) confidence = "medium";
  }

  // Also try to extract from description text using patterns
  if (item.description) {
    const textExtractions = extractFromText(item.description, claimType);
    for (const [k, v] of Object.entries(textExtractions.calcVars)) {
      if (!(k in calcVars)) calcVars[k] = v;
    }
    for (const [k, v] of Object.entries(textExtractions.placeholders)) {
      if (!(k in placeholders)) placeholders[k] = v;
    }
  }

  const totalFound = Object.keys(calcVars).length + Object.keys(placeholders).length;
  if (totalFound === 0) return null;

  if (totalFound >= 3) confidence = "high";
  else if (totalFound >= 1) confidence = "medium";

  return {
    evidenceId: item.id,
    evidenceType: item.evidenceType || rawType,
    title: item.title || "Untitled Evidence",
    sourceDate: item.sourceDate,
    detectedValues: { calculatorVars: calcVars, templatePlaceholders: placeholders },
    confidence,
  };
}

/**
 * Extract values from free text using regex patterns
 */
function extractFromText(
  text: string,
  claimType: string
): { calcVars: Record<string, number>; placeholders: Record<string, string> } {
  const calcVars: Record<string, number> = {};
  const placeholders: Record<string, string> = {};

  // Dollar amounts
  const dollarPattern = /\$[\d,]+(?:\.\d{2})?/g;
  const amounts = text.match(dollarPattern);
  if (amounts && amounts.length > 0) {
    const primaryAmount = parseFloat(amounts[0].replace(/[$,]/g, ""));
    if (primaryAmount > 0) {
      if (claimType === "wage_theft" || claimType === "overtime_violation" || claimType === "minimum_wage_violation") {
        calcVars.unpaid_wages = calcVars.unpaid_wages || primaryAmount;
      } else if (claimType === "consumer_fraud") {
        calcVars.actual_loss = calcVars.actual_loss || primaryAmount;
      } else if (claimType === "security_deposit") {
        calcVars.deposit_amount = calcVars.deposit_amount || primaryAmount;
      } else if (claimType === "housing_discrimination") {
        calcVars.actual_damages = calcVars.actual_damages || primaryAmount;
      } else {
        calcVars.baseDamages = calcVars.baseDamages || primaryAmount;
      }
    }
  }

  // Hours pattern
  const hoursPattern = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/gi;
  const hoursMatch = hoursPattern.exec(text);
  if (hoursMatch) {
    calcVars.overtime_hours = parseFloat(hoursMatch[1]);
  }

  // Rate pattern
  const ratePattern = /\$(\d+(?:\.\d+)?)\s*(?:\/\s*(?:hour|hr)|per\s+hour)/gi;
  const rateMatch = ratePattern.exec(text);
  if (rateMatch) {
    calcVars.regular_rate = parseFloat(rateMatch[1]);
  }

  // Date patterns
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+ \d{1,2},?\s*\d{4})/g;
  const dates = text.match(datePattern);
  if (dates && dates.length > 0) {
    placeholders.violation_date = dates[0];
    if (dates.length > 1) {
      placeholders.violation_end_date = dates[dates.length - 1];
    }
  }

  return { calcVars, placeholders };
}

/**
 * Find a value in a nested object by key (case-insensitive)
 */
function findValue(obj: any, key: string): any {
  if (!obj || typeof obj !== "object") return null;
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lowerKey) return v;
    if (typeof v === "object" && v !== null) {
      const nested = findValue(v, key);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function parseJson(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return null; }
  }
  return null;
}
