/**
 * Luminari — Benefits Navigator: State Overlay System
 *
 * Architecture: Federal Baseline → State Overlays → County/Local Slots
 *
 * This module provides:
 *   1. State detection from user text (names, abbreviations, major cities)
 *   2. Per-state program overlays (local names, phone numbers, application URLs)
 *   3. State-unique programs that don't exist at the federal level
 *   4. Merge logic that combines federal baseline with state-specific data
 *
 * Design principle: When someone in California says "I need food help,"
 * they should see "CalFresh" — not just "SNAP." The phone number should
 * be California's. The application link should go to BenefitsCal.com.
 */

import type { BenefitProgram, BenefitCategory, UrgencyLevel } from "./benefits-navigator";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** US state code (2-letter abbreviation). */
export type StateCode =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "FL" | "GA"
  | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME" | "MD"
  | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ"
  | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC"
  | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY"
  | "DC"
  | "PR" | "GU" | "VI" | "AS" | "MP";

/** Override fields for a federal program in a specific state. */
export interface StateProgramOverride {
  /** The federal program ID being overridden. */
  federal_id: string;
  /** State-specific name (e.g., "CalFresh" instead of "SNAP"). */
  local_name?: string;
  /** State-specific short name for display. */
  local_short_name?: string;
  /** State-specific phone number. */
  phone?: string;
  /** State-specific application website. */
  website?: string;
  /** State-specific how-to-apply steps (replaces federal). */
  how_to_apply?: string[];
  /** Additional note about state-specific rules. */
  state_note?: string;
}

/** A state-unique program that doesn't exist federally. */
export interface StateUniqueProgram {
  id: string;
  name: string;
  short_name: string;
  category: BenefitCategory;
  description: string;
  what_it_does: string;
  who_qualifies: string;
  income_threshold?: string;
  how_to_apply: string[];
  phone?: string;
  website?: string;
  documents_needed: string[];
  deadlines?: string;
  max_benefit?: string;
  urgency: UrgencyLevel;
  situation_signals: string[];
  pipeline_categories: string[];
  pipeline_ids: string[];
  life_events: string[];
  note?: string;
}

/** Complete state overlay data. */
export interface StateOverlay {
  code: StateCode;
  name: string;
  /** Application portal URL (one-stop shop if available). */
  benefits_portal?: string;
  benefits_portal_name?: string;
  /** State social services phone. */
  main_phone?: string;
  /** Overrides for federal programs. */
  overrides: StateProgramOverride[];
  /** State-unique programs. */
  unique_programs: StateUniqueProgram[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Map of state names to codes. */
const STATE_NAMES: Record<string, StateCode> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
  "washington dc": "DC", "washington d.c.": "DC", "d.c.": "DC",
  "puerto rico": "PR", "guam": "GU", "u.s. virgin islands": "VI",
  "us virgin islands": "VI", "virgin islands": "VI",
  "american samoa": "AS", "northern mariana islands": "MP",
  "commonwealth of the northern mariana islands": "MP", "cnmi": "MP",
};

/** Map of state abbreviations (already uppercase). */
const STATE_ABBREVIATIONS: Set<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
  "PR", "GU", "VI", "AS", "MP",
]);

/** Map of major cities to states. */
const CITY_TO_STATE: Record<string, StateCode> = {
  // California
  "los angeles": "CA", "san francisco": "CA", "san diego": "CA", "sacramento": "CA",
  "san jose": "CA", "oakland": "CA", "fresno": "CA", "long beach": "CA",
  "bakersfield": "CA", "anaheim": "CA", "riverside": "CA", "stockton": "CA",
  // Texas
  "houston": "TX", "san antonio": "TX", "dallas": "TX", "austin": "TX",
  "fort worth": "TX", "el paso": "TX", "arlington": "TX", "corpus christi": "TX",
  "plano": "TX", "lubbock": "TX",
  // New York
  "new york city": "NY", "nyc": "NY", "brooklyn": "NY", "queens": "NY",
  "manhattan": "NY", "bronx": "NY", "staten island": "NY", "buffalo": "NY",
  "rochester": "NY", "albany": "NY", "syracuse": "NY",
  // Florida
  "miami": "FL", "orlando": "FL", "tampa": "FL", "jacksonville": "FL",
  "st. petersburg": "FL", "fort lauderdale": "FL", "tallahassee": "FL",
  "hialeah": "FL", "cape coral": "FL",
  // Illinois
  "chicago": "IL", "aurora": "IL", "naperville": "IL", "rockford": "IL",
  "joliet": "IL", "springfield": "IL",
  // Pennsylvania
  "philadelphia": "PA", "pittsburgh": "PA", "allentown": "PA", "erie": "PA",
  "reading": "PA", "harrisburg": "PA",
  // Ohio
  "columbus": "OH", "cleveland": "OH", "cincinnati": "OH", "toledo": "OH",
  "akron": "OH", "dayton": "OH",
  // Georgia
  "atlanta": "GA", "savannah": "GA", "augusta": "GA",
  // Michigan
  "detroit": "MI", "grand rapids": "MI", "flint": "MI", "lansing": "MI",
  // North Carolina
  "charlotte": "NC", "raleigh": "NC", "durham": "NC", "greensboro": "NC",
  // New Jersey
  "newark": "NJ", "jersey city": "NJ", "trenton": "NJ", "paterson": "NJ",
  // Virginia
  "virginia beach": "VA", "norfolk": "VA", "richmond": "VA", "alexandria": "VA",
  // Washington
  "seattle": "WA", "tacoma": "WA", "spokane": "WA",
  // Massachusetts
  "boston": "MA", "worcester": "MA", "cambridge": "MA",
  // Arizona
  "phoenix": "AZ", "tucson": "AZ", "mesa": "AZ", "scottsdale": "AZ",
  // Tennessee
  "nashville": "TN", "memphis": "TN", "knoxville": "TN", "chattanooga": "TN",
  // Colorado
  "denver": "CO", "colorado springs": "CO", "lakewood": "CO",
  // Maryland
  "baltimore": "MD", "annapolis": "MD",
  // Indiana
  "indianapolis": "IN", "fort wayne": "IN",
  // Missouri
  "kansas city": "MO", "st. louis": "MO", "st louis": "MO",
  // Wisconsin
  "milwaukee": "WI", "madison": "WI",
  // Minnesota
  "minneapolis": "MN", "st. paul": "MN", "st paul": "MN",
  // Oregon
  "portland": "OR", "eugene": "OR", "salem": "OR",
  // Louisiana
  "new orleans": "LA", "baton rouge": "LA",
  // Kentucky
  "louisville": "KY", "lexington": "KY",
  // Oklahoma
  "oklahoma city": "OK", "tulsa": "OK",
  // Connecticut
  "hartford": "CT", "new haven": "CT", "bridgeport": "CT",
  // Nevada
  "las vegas": "NV", "reno": "NV",
  // South Carolina
  "charleston": "SC", "columbia": "SC",
  // Alabama
  "birmingham": "AL", "montgomery": "AL", "mobile": "AL",
  // District of Columbia
  "washington": "DC",
  // Territories
  "san juan": "PR", "ponce": "PR", "bayamon": "PR", "carolina": "PR",
  "hagatna": "GU", "tamuning": "GU", "dededo": "GU",
  "charlotte amalie": "VI", "christiansted": "VI", "frederiksted": "VI",
  "pago pago": "AS", "tafuna": "AS",
  "saipan": "MP", "garapan": "MP", "rota": "MP",
};

/** State-specific program name signals (e.g., "CalFresh" → CA). */
const PROGRAM_NAME_SIGNALS: Record<string, StateCode> = {
  "calfresh": "CA", "calworks": "CA", "medi-cal": "CA", "medi cal": "CA",
  "benefitscal": "CA", "ihss": "CA",
  "masshealth": "MA", "tafdc": "MA",
  "tenncare": "TN",
  "soonercare": "OK",
  "apple health": "WA",
  "badgercare": "WI",
  "husky health": "CT", "husky": "CT",
  "kancare": "KS",
  "mainecare": "ME",
  "nj familycare": "NJ",
  "centennial care": "NM",
  "oregon health plan": "OR", "ohp": "OR",
  "healthy connections": "SC",
  "health first colorado": "CO",
  "healthy louisiana": "LA",
  "med-quest": "HI",
  "denalicare": "AK",
  "ahcccs": "AZ",
  "link card": "IL",
  "ohio direction card": "OH",
  "ohio works first": "OH",
  "compass": "PA",
  "yourtexasbenefits": "TX",
  "myaccess": "FL", "myaccess florida": "FL",
};

/**
 * Detect the user's state from their text input.
 * Returns the detected state code, or null if no state is detected.
 * Priority: program name signals > city names > state names > abbreviations
 */
export function detectState(text: string): StateCode | null {
  const normalized = text.toLowerCase().trim();

  // 1. Check program name signals (most specific)
  for (const [signal, state] of Object.entries(PROGRAM_NAME_SIGNALS)) {
    if (normalized.includes(signal)) {
      return state;
    }
  }

  // 2. Check city names (sorted by length descending to match longer names first)
  const sortedCities = Object.entries(CITY_TO_STATE)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [city, state] of sortedCities) {
    if (normalized.includes(city)) {
      return state;
    }
  }

  // 3. Check full state names (sorted by length descending)
  const sortedNames = Object.entries(STATE_NAMES)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [name, code] of sortedNames) {
    if (normalized.includes(name)) {
      return code;
    }
  }

  // 4. Check abbreviations (word-boundary match to avoid false positives)
  const words = text.toUpperCase().split(/\b/);
  for (const word of words) {
    if (STATE_ABBREVIATIONS.has(word.trim())) {
      // Avoid common false positives
      const fp = new Set(["IN", "OR", "ME", "OK", "HI", "OH", "ID", "AL"]);
      if (!fp.has(word.trim())) {
        return word.trim() as StateCode;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE OVERLAY REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const STATE_OVERLAYS: Record<string, StateOverlay> = {
  // ─── CALIFORNIA ───
  CA: {
    code: "CA",
    name: "California",
    benefits_portal: "https://benefitscal.com",
    benefits_portal_name: "BenefitsCal",
    main_phone: "1-877-847-3663",
    overrides: [
      {
        federal_id: "snap",
        local_name: "CalFresh",
        local_short_name: "CalFresh (Food Assistance)",
        phone: "1-877-847-3663",
        website: "https://benefitscal.com",
        how_to_apply: [
          "Apply online at BenefitsCal.com",
          "Call 1-877-847-3663 for help applying",
          "Visit your county social services office",
          "Emergency CalFresh can be issued within 3 days"
        ],
        state_note: "California's CalFresh program has higher income limits than most states. The Restaurant Meals Program allows homeless, elderly, and disabled CalFresh recipients to use benefits at participating restaurants."
      },
      {
        federal_id: "medicaid",
        local_name: "Medi-Cal",
        local_short_name: "Medi-Cal (Health Coverage)",
        phone: "1-800-541-5555",
        website: "https://benefitscal.com",
        how_to_apply: [
          "Apply online at BenefitsCal.com or CoveredCA.com",
          "Call 1-800-541-5555 for Medi-Cal questions",
          "Visit your county social services office",
          "No enrollment period — apply any time"
        ],
        state_note: "California expanded Medi-Cal to cover all income-eligible adults regardless of immigration status as of January 2024."
      },
      {
        federal_id: "tanf",
        local_name: "CalWORKs",
        local_short_name: "CalWORKs (Cash Aid)",
        phone: "1-877-847-3663",
        website: "https://benefitscal.com",
        how_to_apply: [
          "Apply online at BenefitsCal.com",
          "Call your county CalWORKs office",
          "CalWORKs includes cash aid, job training, and child care"
        ],
        state_note: "CalWORKs provides up to 60 months of cash assistance. Includes welfare-to-work services and subsidized child care."
      },
      {
        federal_id: "chip",
        local_name: "Medi-Cal for Children",
        local_short_name: "Medi-Cal for Kids",
        phone: "1-800-541-5555",
        website: "https://benefitscal.com",
        state_note: "In California, CHIP is integrated into Medi-Cal. Children in families earning up to 266% FPL qualify."
      },
      {
        federal_id: "liheap",
        local_name: "LIHEAP / CARE Program",
        local_short_name: "LIHEAP / CARE (Energy Help)",
        phone: "1-866-675-6623",
        website: "https://www.csd.ca.gov/Pages/LIHEAP.aspx",
        state_note: "California also offers the CARE program (20-30% discount on gas/electric) and FERA (12% discount) for moderate-income households."
      }
    ],
    unique_programs: [
      {
        id: "ca_ihss",
        name: "In-Home Supportive Services (IHSS)",
        short_name: "IHSS (In-Home Care)",
        category: "elder_care",
        description: "Pays for in-home caregivers for elderly and disabled Californians.",
        what_it_does: "Provides funding for a caregiver (who can be a family member) to help with daily tasks like bathing, dressing, cooking, cleaning, and transportation. The caregiver is paid by the state.",
        who_qualifies: "Medi-Cal recipients who are elderly (65+), blind, or disabled and need help with daily activities to remain safely at home.",
        how_to_apply: [
          "Contact your county social services office",
          "Call the IHSS helpline at 1-888-944-4477",
          "A social worker will visit your home to assess your needs",
          "You choose your own caregiver — it can be a family member"
        ],
        phone: "1-888-944-4477",
        website: "https://www.cdss.ca.gov/in-home-supportive-services",
        documents_needed: [
          "Proof of Medi-Cal enrollment",
          "Proof of identity",
          "Medical documentation of disability or care needs",
          "Proof of California residency"
        ],
        urgency: "soon",
        situation_signals: ["caregiver", "in-home care", "home care", "can't live alone", "daily care", "bathing help", "elderly care at home"],
        pipeline_categories: ["elder_care", "disability_rights"],
        pipeline_ids: ["elder_neglect", "elder_financial_abuse", "ada_violations"],
        life_events: ["disability_onset", "aging_parent", "caregiver_burnout"],
        note: "California-only program. Caregivers can be family members and are paid by the state."
      },
      {
        id: "ca_restaurant_meals",
        name: "CalFresh Restaurant Meals Program",
        short_name: "Restaurant Meals (CalFresh)",
        category: "food",
        description: "Allows certain CalFresh recipients to use benefits at restaurants.",
        what_it_does: "Lets homeless, elderly (60+), and disabled CalFresh recipients buy prepared meals at participating restaurants using their EBT card.",
        who_qualifies: "CalFresh recipients who are homeless, elderly (60+), or disabled. Available in participating counties.",
        how_to_apply: [
          "If you already have CalFresh and qualify, your EBT card works at participating restaurants",
          "Look for the 'EBT Accepted' sign",
          "Not all counties participate — check with your county office"
        ],
        documents_needed: ["Active CalFresh/EBT card"],
        urgency: "immediate",
        situation_signals: ["homeless", "can't cook", "no kitchen", "restaurant", "prepared meals"],
        pipeline_categories: ["housing_tenant", "elder_care", "disability_rights"],
        pipeline_ids: ["eviction_defense", "homelessness_rights"],
        life_events: ["homelessness"],
        note: "Available in select California counties only."
      }
    ]
  },

  // ─── TEXAS ───
  TX: {
    code: "TX",
    name: "Texas",
    benefits_portal: "https://www.yourtexasbenefits.com",
    benefits_portal_name: "Your Texas Benefits",
    main_phone: "2-1-1",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Texas)",
        local_short_name: "SNAP / Lone Star Card",
        phone: "1-877-541-7905",
        website: "https://www.yourtexasbenefits.com",
        how_to_apply: [
          "Apply online at YourTexasBenefits.com",
          "Call 2-1-1 for assistance",
          "Visit your local HHSC office",
          "Benefits are loaded onto a Lone Star Card"
        ],
        state_note: "Texas uses the Lone Star Card for SNAP benefits. Texas has not expanded Medicaid."
      },
      {
        federal_id: "medicaid",
        local_name: "Texas Medicaid",
        local_short_name: "Texas Medicaid",
        phone: "1-877-541-7905",
        website: "https://www.yourtexasbenefits.com",
        state_note: "Texas has NOT expanded Medicaid. Eligibility is more limited than expansion states. Adults without children generally do not qualify regardless of income."
      },
      {
        federal_id: "tanf",
        local_name: "TANF (Texas)",
        local_short_name: "TANF (Cash Help)",
        phone: "1-877-541-7905",
        website: "https://www.yourtexasbenefits.com",
        state_note: "Texas TANF benefits are among the lowest in the nation. Maximum for a family of 3 is about $308/month."
      },
      {
        federal_id: "chip",
        local_name: "CHIP (Texas)",
        local_short_name: "Texas CHIP",
        phone: "1-877-543-7669",
        website: "https://www.chipmedicaid.org",
        state_note: "Texas CHIP covers children in families earning up to 201% FPL. Includes dental and vision."
      }
    ],
    unique_programs: [
      {
        id: "tx_ceap",
        name: "Comprehensive Energy Assistance Program (CEAP)",
        short_name: "CEAP (Energy Help)",
        category: "utilities",
        description: "Texas-specific energy assistance beyond federal LIHEAP.",
        what_it_does: "Helps pay utility bills, provides weatherization, and assists with energy-related home repairs. Can help with both heating and cooling costs.",
        who_qualifies: "Texas residents at or below 150% of the federal poverty level.",
        income_threshold: "150% FPL",
        how_to_apply: [
          "Contact your local Community Action Agency",
          "Call 2-1-1 Texas for your nearest provider",
          "Apply through your local CEAP administrator"
        ],
        phone: "2-1-1",
        documents_needed: [
          "Proof of income",
          "Utility bills",
          "Proof of Texas residency",
          "Social Security numbers for household members"
        ],
        urgency: "immediate",
        situation_signals: ["utility bill", "electric bill", "power shut off", "no heat", "no cooling", "energy bill"],
        pipeline_categories: ["housing_tenant"],
        pipeline_ids: ["tenant_rights", "utility_shutoff"],
        life_events: ["job_loss", "disability_onset"],
        note: "Texas-specific program administered through local Community Action Agencies."
      }
    ]
  },

  // ─── NEW YORK ───
  NY: {
    code: "NY",
    name: "New York",
    benefits_portal: "https://mybenefits.ny.gov",
    benefits_portal_name: "myBenefits",
    main_phone: "1-800-342-3009",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (New York)",
        local_short_name: "SNAP / NY EBT",
        phone: "1-800-342-3009",
        website: "https://mybenefits.ny.gov",
        how_to_apply: [
          "Apply online at myBenefits.ny.gov",
          "In NYC, apply at ACCESS HRA (a]ccesshra.nyc.gov)",
          "Call 1-800-342-3009 for help",
          "Visit your local Department of Social Services"
        ],
        state_note: "New York has some of the highest SNAP benefit levels in the country due to higher cost of living adjustments."
      },
      {
        federal_id: "medicaid",
        local_name: "Medicaid (New York)",
        local_short_name: "NY Medicaid",
        phone: "1-800-541-2831",
        website: "https://nystateofhealth.ny.gov",
        how_to_apply: [
          "Apply at NY State of Health (nystateofhealth.ny.gov)",
          "Call 1-855-355-5777 for enrollment help",
          "Visit your local Department of Social Services",
          "In NYC, apply through ACCESS HRA"
        ],
        state_note: "New York expanded Medicaid. Essential Plan available for those just above Medicaid limits — $0-20/month premium."
      },
      {
        federal_id: "tanf",
        local_name: "Family Assistance / Safety Net Assistance",
        local_short_name: "Cash Assistance (NY)",
        phone: "1-800-342-3009",
        website: "https://mybenefits.ny.gov",
        state_note: "New York has two cash assistance programs: Family Assistance (for families with children, 60-month limit) and Safety Net Assistance (for individuals and families who exhausted FA)."
      },
      {
        federal_id: "liheap",
        local_name: "HEAP (Home Energy Assistance Program)",
        local_short_name: "HEAP (Energy Help)",
        phone: "1-800-342-3009",
        website: "https://otda.ny.gov/programs/heap/",
        how_to_apply: [
          "Apply at myBenefits.ny.gov",
          "Call 1-800-342-3009",
          "Visit your local Department of Social Services",
          "Regular HEAP opens November 1 each year"
        ],
        state_note: "New York HEAP provides regular and emergency heating assistance. Emergency HEAP available when you're within 12 days of running out of fuel or your utility is about to be shut off."
      }
    ],
    unique_programs: [
      {
        id: "ny_essential_plan",
        name: "Essential Plan",
        short_name: "Essential Plan (NY)",
        category: "healthcare",
        description: "Low-cost health insurance for New Yorkers just above Medicaid limits.",
        what_it_does: "Comprehensive health coverage including doctor visits, hospital care, prescriptions, mental health, and dental for $0-20/month. No deductible.",
        who_qualifies: "New York residents ages 19-64 with income between 138-200% FPL who don't qualify for Medicaid. Also available to certain immigrants regardless of status.",
        income_threshold: "138-200% FPL",
        how_to_apply: [
          "Apply at NY State of Health (nystateofhealth.ny.gov)",
          "Call 1-855-355-5777",
          "Visit a navigator or enrollment assister"
        ],
        phone: "1-855-355-5777",
        website: "https://nystateofhealth.ny.gov",
        documents_needed: [
          "Proof of identity",
          "Proof of New York residency",
          "Proof of income",
          "Immigration documents (if applicable)"
        ],
        urgency: "soon",
        situation_signals: ["health insurance", "no insurance", "uninsured", "can't afford doctor", "medical bills"],
        pipeline_categories: ["healthcare_insurance", "employment_labor"],
        pipeline_ids: ["insurance_claim_denial", "medical_malpractice"],
        life_events: ["job_loss", "divorce", "aging_out"],
        note: "New York-only program. One of the most affordable health plans in the country."
      },
      {
        id: "ny_emergency_assistance",
        name: "Emergency Assistance for Adults (EAA)",
        short_name: "Emergency Assistance (NY)",
        category: "cash_assistance",
        description: "Emergency cash and housing help for adults in crisis.",
        what_it_does: "Provides emergency shelter, utility payments, moving expenses, and other one-time emergency assistance for adults without children.",
        who_qualifies: "New York residents facing an emergency (homelessness, utility shutoff, eviction) who don't qualify for other programs.",
        how_to_apply: [
          "Contact your local Department of Social Services",
          "In NYC, go to an HRA Job Center or call 311",
          "Apply through myBenefits.ny.gov"
        ],
        phone: "1-800-342-3009",
        website: "https://mybenefits.ny.gov",
        documents_needed: [
          "Proof of identity",
          "Proof of emergency (eviction notice, utility shutoff notice)",
          "Proof of income or lack thereof"
        ],
        urgency: "immediate",
        situation_signals: ["emergency", "homeless", "eviction", "utility shutoff", "no shelter"],
        pipeline_categories: ["housing_tenant"],
        pipeline_ids: ["eviction_defense", "homelessness_rights"],
        life_events: ["homelessness", "eviction", "domestic_violence"],
        note: "New York-only emergency program."
      }
    ]
  },

  // ─── FLORIDA ───
  FL: {
    code: "FL",
    name: "Florida",
    benefits_portal: "https://www.myflorida.com/accessflorida/",
    benefits_portal_name: "ACCESS Florida",
    main_phone: "1-866-762-2237",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Florida)",
        local_short_name: "SNAP / Florida EBT",
        phone: "1-866-762-2237",
        website: "https://www.myflorida.com/accessflorida/",
        how_to_apply: [
          "Apply online at ACCESS Florida (myflorida.com/accessflorida)",
          "Call 1-866-762-2237",
          "Visit your local DCF office"
        ]
      },
      {
        federal_id: "medicaid",
        local_name: "Florida Medicaid",
        local_short_name: "Florida Medicaid",
        phone: "1-888-419-3456",
        website: "https://www.myflorida.com/accessflorida/",
        state_note: "Florida has NOT expanded Medicaid. Eligibility is limited for adults without children."
      },
      {
        federal_id: "chip",
        local_name: "Florida KidCare",
        local_short_name: "Florida KidCare",
        phone: "1-888-540-5437",
        website: "https://www.floridakidcare.org",
        state_note: "Florida KidCare includes Medicaid for children, MediKids, Healthy Kids, and CMS. Covers children from birth through age 18."
      }
    ],
    unique_programs: [
      {
        id: "fl_kidcare",
        name: "Florida KidCare",
        short_name: "Florida KidCare",
        category: "children_families",
        description: "Comprehensive health insurance for Florida's children.",
        what_it_does: "Provides health, dental, and vision coverage for children birth through 18. Includes four programs based on age and family income. Premiums range from free to $15-20/month.",
        who_qualifies: "Uninsured children under 19 in families earning up to 200% FPL (higher for some programs).",
        income_threshold: "Up to 200% FPL",
        how_to_apply: [
          "Apply online at FloridaKidCare.org",
          "Call 1-888-540-5437",
          "Apply through ACCESS Florida"
        ],
        phone: "1-888-540-5437",
        website: "https://www.floridakidcare.org",
        documents_needed: [
          "Child's Social Security number",
          "Proof of Florida residency",
          "Proof of family income",
          "Child's birth certificate"
        ],
        urgency: "soon",
        situation_signals: ["child health insurance", "kids insurance", "children health", "uninsured child"],
        pipeline_categories: ["family_custody", "healthcare_insurance"],
        pipeline_ids: ["child_custody", "child_support"],
        life_events: ["new_baby", "divorce", "job_loss"],
        note: "Florida-only program. One of the most comprehensive children's health programs in the country."
      }
    ]
  },

  // ─── ILLINOIS ───
  IL: {
    code: "IL",
    name: "Illinois",
    benefits_portal: "https://abe.illinois.gov",
    benefits_portal_name: "ABE (Application for Benefits Eligibility)",
    main_phone: "1-800-843-6154",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP / LINK",
        local_short_name: "SNAP / LINK Card",
        phone: "1-800-843-6154",
        website: "https://abe.illinois.gov",
        how_to_apply: [
          "Apply online at ABE (abe.illinois.gov)",
          "Call 1-800-843-6154",
          "Visit your local DHS office"
        ],
        state_note: "Illinois uses the LINK card for SNAP benefits."
      },
      {
        federal_id: "medicaid",
        local_name: "Illinois Medicaid",
        local_short_name: "Illinois Medicaid",
        phone: "1-800-843-6154",
        website: "https://abe.illinois.gov",
        state_note: "Illinois expanded Medicaid. Also offers All Kids program for children regardless of immigration status."
      },
      {
        federal_id: "chip",
        local_name: "All Kids",
        local_short_name: "All Kids (IL)",
        phone: "1-866-255-5437",
        website: "https://www.allkids.com",
        state_note: "Illinois All Kids covers children regardless of immigration status, income, or pre-existing conditions."
      }
    ],
    unique_programs: [
      {
        id: "il_all_kids",
        name: "All Kids",
        short_name: "All Kids (Illinois)",
        category: "children_families",
        description: "Health insurance for all Illinois children regardless of immigration status.",
        what_it_does: "Comprehensive health coverage for children including doctor visits, hospital care, prescriptions, dental, vision, and mental health. Available regardless of immigration status.",
        who_qualifies: "All children in Illinois under 19, regardless of immigration status. Free for families at or below 147% FPL; sliding scale premiums above that.",
        income_threshold: "No income limit (premiums vary)",
        how_to_apply: [
          "Apply online at ABE (abe.illinois.gov)",
          "Call 1-866-ALL-KIDS (1-866-255-5437)",
          "Visit your local DHS office"
        ],
        phone: "1-866-255-5437",
        website: "https://www.allkids.com",
        documents_needed: [
          "Child's proof of identity",
          "Proof of Illinois residency",
          "Proof of family income"
        ],
        urgency: "soon",
        situation_signals: ["child health", "kids insurance", "children coverage", "undocumented children"],
        pipeline_categories: ["family_custody", "immigration_rights", "healthcare_insurance"],
        pipeline_ids: ["child_custody", "immigration_defense"],
        life_events: ["new_baby", "immigration_crisis"],
        note: "Illinois-only. Covers ALL children regardless of immigration status."
      }
    ]
  },

  // ─── OHIO ───
  OH: {
    code: "OH",
    name: "Ohio",
    benefits_portal: "https://benefits.ohio.gov",
    benefits_portal_name: "Ohio Benefits",
    main_phone: "1-844-640-6446",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP / Ohio Direction Card",
        local_short_name: "SNAP / Direction Card",
        phone: "1-844-640-6446",
        website: "https://benefits.ohio.gov",
        how_to_apply: [
          "Apply online at benefits.ohio.gov",
          "Call 1-844-640-6446",
          "Visit your county Department of Job and Family Services"
        ],
        state_note: "Ohio uses the Ohio Direction Card for SNAP benefits."
      },
      {
        federal_id: "medicaid",
        local_name: "Ohio Medicaid",
        local_short_name: "Ohio Medicaid",
        phone: "1-800-324-8680",
        website: "https://benefits.ohio.gov",
        state_note: "Ohio expanded Medicaid in 2014."
      },
      {
        federal_id: "tanf",
        local_name: "Ohio Works First",
        local_short_name: "Ohio Works First",
        phone: "1-844-640-6446",
        website: "https://benefits.ohio.gov",
        state_note: "Ohio Works First provides cash assistance and employment services."
      }
    ],
    unique_programs: []
  },

  // ─── PENNSYLVANIA ───
  PA: {
    code: "PA",
    name: "Pennsylvania",
    benefits_portal: "https://www.compass.state.pa.us",
    benefits_portal_name: "COMPASS",
    main_phone: "1-800-692-7462",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Pennsylvania)",
        local_short_name: "SNAP / PA EBT",
        phone: "1-800-692-7462",
        website: "https://www.compass.state.pa.us",
        how_to_apply: [
          "Apply online at COMPASS (compass.state.pa.us)",
          "Call 1-800-692-7462",
          "Visit your county assistance office"
        ]
      },
      {
        federal_id: "medicaid",
        local_name: "Medical Assistance (PA)",
        local_short_name: "Medical Assistance (PA)",
        phone: "1-800-692-7462",
        website: "https://www.compass.state.pa.us",
        state_note: "Pennsylvania expanded Medicaid. Apply through COMPASS."
      }
    ],
    unique_programs: []
  },

  // ─── WASHINGTON ───
  WA: {
    code: "WA",
    name: "Washington",
    benefits_portal: "https://www.washingtonconnection.org",
    benefits_portal_name: "Washington Connection",
    main_phone: "1-877-501-2233",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Basic Food",
        local_short_name: "Basic Food (WA)",
        phone: "1-877-501-2233",
        website: "https://www.washingtonconnection.org",
        how_to_apply: [
          "Apply online at WashingtonConnection.org",
          "Call 1-877-501-2233",
          "Visit your local Community Services Office"
        ],
        state_note: "Washington calls SNAP 'Basic Food.' Benefits are loaded onto an EBT card."
      },
      {
        federal_id: "medicaid",
        local_name: "Apple Health",
        local_short_name: "Apple Health (WA)",
        phone: "1-800-562-3022",
        website: "https://www.washingtonconnection.org",
        state_note: "Washington's Apple Health covers adults up to 138% FPL and children up to 312% FPL."
      },
      {
        federal_id: "tanf",
        local_name: "WorkFirst / TANF",
        local_short_name: "WorkFirst (WA)",
        phone: "1-877-501-2233",
        website: "https://www.washingtonconnection.org",
        state_note: "Washington's WorkFirst program combines cash assistance with employment services."
      }
    ],
    unique_programs: []
  },

  // ─── MASSACHUSETTS ───
  MA: {
    code: "MA",
    name: "Massachusetts",
    benefits_portal: "https://dtaconnect.eohhs.mass.gov",
    benefits_portal_name: "DTA Connect",
    main_phone: "1-877-382-2363",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Massachusetts)",
        local_short_name: "SNAP / MA EBT",
        phone: "1-877-382-2363",
        website: "https://dtaconnect.eohhs.mass.gov",
        how_to_apply: [
          "Apply online at DTA Connect (dtaconnect.eohhs.mass.gov)",
          "Call DTA Assistance Line: 1-877-382-2363",
          "Visit your local DTA office"
        ]
      },
      {
        federal_id: "medicaid",
        local_name: "MassHealth",
        local_short_name: "MassHealth",
        phone: "1-800-841-2900",
        website: "https://www.mass.gov/masshealth",
        state_note: "MassHealth covers more people than standard Medicaid. Includes ConnectorCare for those just above Medicaid limits."
      },
      {
        federal_id: "tanf",
        local_name: "TAFDC (Transitional Aid to Families with Dependent Children)",
        local_short_name: "TAFDC (Cash Aid)",
        phone: "1-877-382-2363",
        website: "https://dtaconnect.eohhs.mass.gov",
        state_note: "Massachusetts TAFDC provides cash assistance plus employment services."
      }
    ],
    unique_programs: []
  },

  // ─── GEORGIA ───
  GA: {
    code: "GA",
    name: "Georgia",
    benefits_portal: "https://gateway.ga.gov",
    benefits_portal_name: "Georgia Gateway",
    main_phone: "1-877-423-4746",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Georgia)",
        local_short_name: "SNAP / GA EBT",
        phone: "1-877-423-4746",
        website: "https://gateway.ga.gov",
        how_to_apply: [
          "Apply online at Georgia Gateway (gateway.ga.gov)",
          "Call 1-877-423-4746",
          "Visit your county DFCS office"
        ]
      },
      {
        federal_id: "medicaid",
        local_name: "Georgia Medicaid",
        local_short_name: "Georgia Medicaid",
        phone: "1-866-211-0950",
        website: "https://gateway.ga.gov",
        state_note: "Georgia has limited Medicaid expansion. PeachCare for Kids covers children up to 247% FPL."
      },
      {
        federal_id: "chip",
        local_name: "PeachCare for Kids",
        local_short_name: "PeachCare for Kids",
        phone: "1-877-427-3224",
        website: "https://dch.georgia.gov/peachcare-kids",
        state_note: "PeachCare covers uninsured children under 19 in families earning up to 247% FPL."
      }
    ],
    unique_programs: []
  },

  // ─── MICHIGAN ───
  MI: {
    code: "MI",
    name: "Michigan",
    benefits_portal: "https://newmibridges.michigan.gov",
    benefits_portal_name: "MI Bridges",
    main_phone: "1-844-799-9876",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP / Bridge Card",
        local_short_name: "SNAP / Bridge Card",
        phone: "1-844-799-9876",
        website: "https://newmibridges.michigan.gov",
        how_to_apply: [
          "Apply online at MI Bridges (newmibridges.michigan.gov)",
          "Call 1-844-799-9876",
          "Visit your local DHHS office"
        ],
        state_note: "Michigan uses the Bridge Card for SNAP benefits."
      },
      {
        federal_id: "medicaid",
        local_name: "Healthy Michigan Plan",
        local_short_name: "Healthy Michigan",
        phone: "1-888-367-6557",
        website: "https://newmibridges.michigan.gov",
        state_note: "Michigan expanded Medicaid through the Healthy Michigan Plan."
      }
    ],
    unique_programs: []
  },

  // ─── NORTH CAROLINA ───
  NC: {
    code: "NC",
    name: "North Carolina",
    benefits_portal: "https://epass.nc.gov",
    benefits_portal_name: "ePASS",
    main_phone: "1-866-719-0141",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Food & Nutrition Services (FNS)",
        local_short_name: "FNS / NC EBT",
        phone: "1-866-719-0141",
        website: "https://epass.nc.gov",
        how_to_apply: [
          "Apply online at ePASS (epass.nc.gov)",
          "Call 1-866-719-0141",
          "Visit your county Department of Social Services"
        ],
        state_note: "North Carolina calls SNAP 'Food & Nutrition Services (FNS).'"
      },
      {
        federal_id: "medicaid",
        local_name: "NC Medicaid",
        local_short_name: "NC Medicaid",
        phone: "1-888-245-0179",
        website: "https://epass.nc.gov",
        state_note: "North Carolina expanded Medicaid in December 2023."
      }
    ],
    unique_programs: []
  },

  // ─── ARIZONA ───
  AZ: {
    code: "AZ",
    name: "Arizona",
    benefits_portal: "https://www.healthearizonaplus.gov",
    benefits_portal_name: "Health-e-Arizona Plus",
    main_phone: "1-855-432-7587",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Nutrition Assistance (NA)",
        local_short_name: "Nutrition Assistance (AZ)",
        phone: "1-855-432-7587",
        website: "https://www.healthearizonaplus.gov",
        how_to_apply: [
          "Apply online at Health-e-Arizona Plus",
          "Call 1-855-432-7587",
          "Visit your local DES office"
        ],
        state_note: "Arizona calls SNAP 'Nutrition Assistance.'"
      },
      {
        federal_id: "medicaid",
        local_name: "AHCCCS (Arizona Health Care Cost Containment System)",
        local_short_name: "AHCCCS",
        phone: "1-855-432-7587",
        website: "https://www.healthearizonaplus.gov",
        state_note: "Arizona's Medicaid program is called AHCCCS (pronounced 'access'). Arizona was one of the first states to expand Medicaid."
      }
    ],
    unique_programs: []
  },

  // ─── COLORADO ───
  CO: {
    code: "CO",
    name: "Colorado",
    benefits_portal: "https://peak.colorado.gov",
    benefits_portal_name: "PEAK",
    main_phone: "1-800-221-3943",
    overrides: [
      {
        federal_id: "snap",
        local_name: "SNAP (Colorado)",
        local_short_name: "SNAP / CO EBT",
        phone: "1-800-221-3943",
        website: "https://peak.colorado.gov",
        how_to_apply: [
          "Apply online at PEAK (peak.colorado.gov)",
          "Call 1-800-221-3943",
          "Visit your county Department of Human Services"
        ]
      },
      {
        federal_id: "medicaid",
        local_name: "Health First Colorado",
        local_short_name: "Health First Colorado",
        phone: "1-800-221-3943",
        website: "https://peak.colorado.gov",
        state_note: "Colorado's Medicaid is called Health First Colorado. CHP+ covers children and pregnant women above Medicaid limits."
      },
      {
        federal_id: "chip",
        local_name: "CHP+ (Child Health Plan Plus)",
        local_short_name: "CHP+ (Colorado)",
        phone: "1-800-221-3943",
        website: "https://peak.colorado.gov",
        state_note: "CHP+ covers children and pregnant women in families earning up to 260% FPL."
      }
    ],
    unique_programs: []
  },

  // ─── CONNECTICUT ───
  CT: {
    code: "CT",
    name: "Connecticut",
    benefits_portal: "https://www.connect.ct.gov",
    benefits_portal_name: "ConneCT",
    main_phone: "1-855-626-6632",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "HUSKY Health",
        local_short_name: "HUSKY Health (CT)",
        phone: "1-855-626-6632",
        website: "https://www.huskyhealth.com",
        state_note: "Connecticut's HUSKY Health has four parts: HUSKY A (Medicaid), HUSKY B (CHIP), HUSKY C (Medicare Savings), HUSKY D (low-income adults)."
      }
    ],
    unique_programs: []
  },

  // ─── TENNESSEE ───
  TN: {
    code: "TN",
    name: "Tennessee",
    benefits_portal: "https://fabenefits.tn.gov",
    benefits_portal_name: "FA Benefits",
    main_phone: "1-866-311-4287",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "TennCare",
        local_short_name: "TennCare",
        phone: "1-800-342-3145",
        website: "https://www.tn.gov/tenncare",
        state_note: "TennCare is Tennessee's Medicaid managed care program. Tennessee has not expanded Medicaid for adults."
      }
    ],
    unique_programs: []
  },

  // ─── OKLAHOMA ───
  OK: {
    code: "OK",
    name: "Oklahoma",
    benefits_portal: "https://okdhslive.org",
    benefits_portal_name: "OKDHS Live!",
    main_phone: "1-866-411-1877",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "SoonerCare",
        local_short_name: "SoonerCare (OK)",
        phone: "1-800-987-7767",
        website: "https://www.okhca.org/individuals",
        state_note: "Oklahoma expanded Medicaid through SoonerCare in 2021 via ballot initiative."
      }
    ],
    unique_programs: []
  },

  // ─── OREGON ───
  OR: {
    code: "OR",
    name: "Oregon",
    benefits_portal: "https://one.oregon.gov",
    benefits_portal_name: "ONE (Oregon Eligibility)",
    main_phone: "1-800-699-9075",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Oregon Health Plan (OHP)",
        local_short_name: "Oregon Health Plan",
        phone: "1-800-699-9075",
        website: "https://one.oregon.gov",
        state_note: "Oregon Health Plan covers adults up to 138% FPL and children up to 305% FPL."
      },
      {
        federal_id: "snap",
        local_name: "SNAP (Oregon)",
        local_short_name: "SNAP / OR EBT",
        phone: "1-800-723-3638",
        website: "https://one.oregon.gov",
        how_to_apply: [
          "Apply online at ONE (one.oregon.gov)",
          "Call 1-800-723-3638",
          "Visit your local DHS office"
        ]
      }
    ],
    unique_programs: []
  },

  // ─── NEW JERSEY ───
  NJ: {
    code: "NJ",
    name: "New Jersey",
    benefits_portal: "https://oneapp.dhs.state.nj.us",
    benefits_portal_name: "NJ OneApp",
    main_phone: "1-800-792-9745",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "NJ FamilyCare",
        local_short_name: "NJ FamilyCare",
        phone: "1-800-701-0710",
        website: "https://www.njfamilycare.org",
        state_note: "NJ FamilyCare combines Medicaid and CHIP into one program. Covers children, parents, and adults."
      }
    ],
    unique_programs: []
  },

  // ─── WISCONSIN ───
  WI: {
    code: "WI",
    name: "Wisconsin",
    benefits_portal: "https://access.wisconsin.gov",
    benefits_portal_name: "ACCESS Wisconsin",
    main_phone: "1-800-362-3002",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "BadgerCare Plus",
        local_short_name: "BadgerCare Plus (WI)",
        phone: "1-800-362-3002",
        website: "https://access.wisconsin.gov",
        state_note: "BadgerCare Plus covers adults up to 100% FPL and children up to 300% FPL."
      },
      {
        federal_id: "snap",
        local_name: "FoodShare",
        local_short_name: "FoodShare (WI)",
        phone: "1-800-362-3002",
        website: "https://access.wisconsin.gov",
        state_note: "Wisconsin calls SNAP 'FoodShare.'"
      }
    ],
    unique_programs: []
  },

  // ─── MINNESOTA ───
  MN: {
    code: "MN",
    name: "Minnesota",
    benefits_portal: "https://applymn.dhs.mn.gov",
    benefits_portal_name: "ApplyMN",
    main_phone: "1-800-657-3672",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Medical Assistance / MinnesotaCare",
        local_short_name: "Medical Assistance (MN)",
        phone: "1-800-657-3672",
        website: "https://applymn.dhs.mn.gov",
        state_note: "Minnesota has Medical Assistance (Medicaid) and MinnesotaCare (for those above Medicaid limits but below 200% FPL)."
      },
      {
        federal_id: "snap",
        local_name: "SNAP (Minnesota)",
        local_short_name: "SNAP / MN EBT",
        phone: "1-800-657-3672",
        website: "https://applymn.dhs.mn.gov"
      }
    ],
    unique_programs: [
      {
        id: "mn_minnesotacare",
        name: "MinnesotaCare",
        short_name: "MinnesotaCare",
        category: "healthcare",
        description: "Affordable health coverage for Minnesotans just above Medicaid limits.",
        what_it_does: "Comprehensive health coverage with low premiums for people who earn too much for Medical Assistance but can't afford private insurance. Covers doctor visits, hospital, prescriptions, dental, and mental health.",
        who_qualifies: "Minnesota residents ages 19-64 with income between 138-200% FPL who don't have access to affordable employer coverage.",
        income_threshold: "138-200% FPL",
        how_to_apply: [
          "Apply online at ApplyMN (applymn.dhs.mn.gov)",
          "Call 1-800-657-3672",
          "Visit your county human services office"
        ],
        phone: "1-800-657-3672",
        website: "https://applymn.dhs.mn.gov",
        documents_needed: [
          "Proof of identity",
          "Proof of Minnesota residency",
          "Proof of income",
          "Immigration documents (if applicable)"
        ],
        urgency: "soon",
        situation_signals: ["health insurance", "no insurance", "can't afford insurance", "medical bills"],
        pipeline_categories: ["healthcare_insurance", "employment_labor"],
        pipeline_ids: ["insurance_claim_denial"],
        life_events: ["job_loss", "divorce"],
        note: "Minnesota-only program."
      }
    ]
  },

  // ─── LOUISIANA ───
  LA: {
    code: "LA",
    name: "Louisiana",
    benefits_portal: "https://cafe.ldh.la.gov",
    benefits_portal_name: "CAFE",
    main_phone: "1-888-342-6207",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Healthy Louisiana",
        local_short_name: "Healthy Louisiana",
        phone: "1-888-342-6207",
        website: "https://ldh.la.gov/healthy-louisiana",
        state_note: "Louisiana expanded Medicaid in 2016 through Healthy Louisiana."
      }
    ],
    unique_programs: []
  },

  // ─── INDIANA ───
  IN: {
    code: "IN",
    name: "Indiana",
    benefits_portal: "https://fssabenefits.in.gov",
    benefits_portal_name: "FSSA Benefits Portal",
    main_phone: "1-800-403-0864",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Healthy Indiana Plan (HIP)",
        local_short_name: "Healthy Indiana Plan",
        phone: "1-877-438-4479",
        website: "https://www.in.gov/medicaid/members/",
        state_note: "Indiana expanded Medicaid through the Healthy Indiana Plan (HIP). Requires small monthly contributions to a POWER account."
      },
      {
        federal_id: "chip",
        local_name: "Hoosier Healthwise",
        local_short_name: "Hoosier Healthwise (IN)",
        phone: "1-800-889-9949",
        website: "https://www.in.gov/medicaid/members/",
        state_note: "Hoosier Healthwise covers children and pregnant women."
      }
    ],
    unique_programs: []
  },

  // ─── VIRGINIA ───
  VA: {
    code: "VA",
    name: "Virginia",
    benefits_portal: "https://commonhelp.virginia.gov",
    benefits_portal_name: "CommonHelp",
    main_phone: "1-855-635-4370",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Virginia Cardinal Care",
        local_short_name: "Cardinal Care (VA)",
        phone: "1-855-242-8282",
        website: "https://commonhelp.virginia.gov",
        state_note: "Virginia expanded Medicaid in 2019 through Cardinal Care."
      },
      {
        federal_id: "chip",
        local_name: "FAMIS (Family Access to Medical Insurance Security)",
        local_short_name: "FAMIS (VA)",
        phone: "1-866-873-2647",
        website: "https://www.famis.org",
        state_note: "FAMIS covers children and pregnant women above Medicaid limits."
      }
    ],
    unique_programs: []
  },

  // ─── HAWAII ───
  HI: {
    code: "HI",
    name: "Hawaii",
    benefits_portal: "https://mydss.hawaii.gov",
    benefits_portal_name: "MyDSS Hawaii",
    main_phone: "1-855-643-1643",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Med-QUEST",
        local_short_name: "Med-QUEST (HI)",
        phone: "1-800-316-8005",
        website: "https://medquest.hawaii.gov",
        state_note: "Hawaii's Med-QUEST has some of the most generous eligibility in the country."
      }
    ],
    unique_programs: []
  },

  // ─── KANSAS ───
  KS: {
    code: "KS",
    name: "Kansas",
    benefits_portal: "https://cssp.kees.ks.gov",
    benefits_portal_name: "KEES",
    main_phone: "1-888-369-4777",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "KanCare",
        local_short_name: "KanCare (KS)",
        phone: "1-800-792-4884",
        website: "https://cssp.kees.ks.gov",
        state_note: "KanCare is Kansas's Medicaid managed care program. Kansas has not expanded Medicaid for adults."
      }
    ],
    unique_programs: []
  },

  // ─── MAINE ───
  ME: {
    code: "ME",
    name: "Maine",
    benefits_portal: "https://ams-prd.maine.gov",
    benefits_portal_name: "My Maine Connection",
    main_phone: "1-855-797-4357",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "MaineCare",
        local_short_name: "MaineCare",
        phone: "1-855-797-4357",
        website: "https://www.maine.gov/dhhs/ofi/programs-services/mainecare",
        state_note: "Maine expanded Medicaid through MaineCare in 2019."
      }
    ],
    unique_programs: []
  },

  // ─── NEW MEXICO ───
  NM: {
    code: "NM",
    name: "New Mexico",
    benefits_portal: "https://www.yes.state.nm.us",
    benefits_portal_name: "YES New Mexico",
    main_phone: "1-800-283-4465",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Centennial Care",
        local_short_name: "Centennial Care (NM)",
        phone: "1-855-523-7473",
        website: "https://www.yes.state.nm.us",
        state_note: "New Mexico's Centennial Care expanded Medicaid and includes behavioral health services."
      }
    ],
    unique_programs: []
  },

  // ─── SOUTH CAROLINA ───
  SC: {
    code: "SC",
    name: "South Carolina",
    benefits_portal: "https://dss.sc.gov",
    benefits_portal_name: "SC DSS",
    main_phone: "1-800-616-1309",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "Healthy Connections",
        local_short_name: "Healthy Connections (SC)",
        phone: "1-888-549-0820",
        website: "https://www.scdhhs.gov",
        state_note: "South Carolina has not expanded Medicaid. Healthy Connections covers children, pregnant women, elderly, and disabled."
      }
    ],
    unique_programs: []
  },

  // ─── DISTRICT OF COLUMBIA ───
  DC: {
    code: "DC",
    name: "District of Columbia",
    benefits_portal: "https://dchealth.dc.gov",
    benefits_portal_name: "DC Health Link",
    main_phone: "1-855-532-5465",
    overrides: [
      {
        federal_id: "medicaid",
        local_name: "DC Medicaid / Alliance",
        local_short_name: "DC Medicaid",
        phone: "1-855-532-5465",
        website: "https://dhcf.dc.gov",
        state_note: "DC expanded Medicaid and also offers the DC Healthcare Alliance for residents who don't qualify for Medicaid regardless of immigration status."
      }
    ],
    unique_programs: [
      {
        id: "dc_healthcare_alliance",
        name: "DC Healthcare Alliance",
        short_name: "DC Healthcare Alliance",
        category: "healthcare",
        description: "Health coverage for DC residents regardless of immigration status.",
        what_it_does: "Provides comprehensive health coverage including doctor visits, hospital care, prescriptions, and mental health services for DC residents who don't qualify for Medicaid.",
        who_qualifies: "DC residents with income up to 200% FPL who are not eligible for Medicaid, regardless of immigration status.",
        income_threshold: "200% FPL",
        how_to_apply: [
          "Apply at your local DC Economic Security Administration (ESA) service center",
          "Call 1-855-532-5465",
          "Must recertify every 6 months"
        ],
        phone: "1-855-532-5465",
        website: "https://dhcf.dc.gov/service/dc-healthcare-alliance",
        documents_needed: [
          "Proof of DC residency",
          "Proof of income",
          "Photo ID"
        ],
        urgency: "soon",
        situation_signals: ["no insurance", "uninsured", "undocumented", "health coverage", "can't afford doctor"],
        pipeline_categories: ["healthcare_insurance", "immigration_rights"],
        pipeline_ids: ["immigration_defense"],
        life_events: ["immigration_crisis", "job_loss"],
        note: "DC-only program. Covers residents regardless of immigration status."
      }
    ]
  },
    AK: {
    code: "AK",
    name: "Alaska",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Alaska SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Denali KidCare/Alaska Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "Alaska TANF",
      },
    ],
    unique_programs: []
  },
  AL: {
    code: "AL",
    name: "Alabama",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Alabama SNAP",
        phone: "334-242-1773",
      },
      {
        federal_id: "medicaid",
        local_name: "Alabama Medicaid",
        phone: "334-263-0500",
      },
      {
        federal_id: "tanf",
        local_name: "Alabama TANF",
      },
    ],
    unique_programs: []
  },
  AR: {
    code: "AR",
    name: "Arkansas",
    overrides: [
      {
        federal_id: "snap",
        local_name: "AR SNAP",
        phone: "501-682-8375",
      },
      {
        federal_id: "medicaid",
        local_name: "ARKids First/AR Medicaid",
        phone: "888-987-1200",
      },
      {
        federal_id: "tanf",
        local_name: "TEA (Transitional Employment Assistance)",
      },
    ],
    unique_programs: []
  },
  AS: {
    code: "AS",
    name: "American Samoa",
    overrides: [
      {
        federal_id: "snap",
        local_name: "AS Nutrition Assistance",
      },
      {
        federal_id: "medicaid",
        local_name: "AS Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "AS TANF",
      },
    ],
    unique_programs: []
  },
  DE: {
    code: "DE",
    name: "Delaware",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Delaware SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Delaware Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "Delaware TANF",
      },
    ],
    unique_programs: []
  },
  GU: {
    code: "GU",
    name: "Guam",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Guam SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Guam MIP",
      },
      {
        federal_id: "tanf",
        local_name: "Guam TANF",
      },
    ],
    unique_programs: []
  },
  IA: {
    code: "IA",
    name: "Iowa",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Iowa Food Assistance",
      },
      {
        federal_id: "medicaid",
        local_name: "Iowa Health Link",
      },
      {
        federal_id: "tanf",
        local_name: "FIP (Family Investment Program)",
      },
    ],
    unique_programs: []
  },
  ID: {
    code: "ID",
    name: "Idaho",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Idaho SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Idaho Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "Idaho TAFI",
      },
    ],
    unique_programs: []
  },
  KY: {
    code: "KY",
    name: "Kentucky",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Kentucky SNAP",
        phone: "855-459-6328",
      },
      {
        federal_id: "medicaid",
        local_name: "Kentucky Medicaid",
        phone: "855-459-6328",
      },
      {
        federal_id: "tanf",
        local_name: "K-TAP",
      },
    ],
    unique_programs: []
  },
  MD: {
    code: "MD",
    name: "Maryland",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Maryland SNAP",
        phone: "800-332-6347",
      },
      {
        federal_id: "medicaid",
        local_name: "Maryland Health Connection",
        phone: "800-492-5231",
      },
      {
        federal_id: "tanf",
        local_name: "TCA (Temporary Cash Assistance)",
      },
    ],
    unique_programs: []
  },
  MO: {
    code: "MO",
    name: "Missouri",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Missouri SNAP",
        phone: "855-373-4636",
      },
      {
        federal_id: "medicaid",
        local_name: "MO HealthNet",
        phone: "800-392-2161",
      },
      {
        federal_id: "tanf",
        local_name: "Missouri TANF",
      },
    ],
    unique_programs: []
  },
  MP: {
    code: "MP",
    name: "Northern Mariana Islands",
    overrides: [
      {
        federal_id: "snap",
        local_name: "CNMI Nutrition Assistance",
      },
      {
        federal_id: "medicaid",
        local_name: "CNMI Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "CNMI TANF",
      },
    ],
    unique_programs: []
  },
  MS: {
    code: "MS",
    name: "Mississippi",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Mississippi SNAP",
        phone: "601-359-4500",
      },
      {
        federal_id: "medicaid",
        local_name: "Mississippi Medicaid",
        phone: "662-741-2151",
      },
      {
        federal_id: "tanf",
        local_name: "Mississippi TANF",
      },
    ],
    unique_programs: []
  },
  MT: {
    code: "MT",
    name: "Montana",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Montana SNAP",
        phone: "888-706-1535",
      },
      {
        federal_id: "medicaid",
        local_name: "Montana Medicaid (HELP Plan)",
        phone: "888-706-1535",
      },
      {
        federal_id: "tanf",
        local_name: "Montana TANF",
      },
    ],
    unique_programs: []
  },
  ND: {
    code: "ND",
    name: "North Dakota",
    overrides: [
      {
        federal_id: "snap",
        local_name: "North Dakota SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "North Dakota Medicaid Expansion",
      },
      {
        federal_id: "tanf",
        local_name: "North Dakota TANF",
      },
    ],
    unique_programs: []
  },
  NE: {
    code: "NE",
    name: "Nebraska",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Nebraska SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Heritage Health (Nebraska Medicaid)",
      },
      {
        federal_id: "tanf",
        local_name: "ADC (Aid to Dependent Children)",
      },
    ],
    unique_programs: []
  },
  NH: {
    code: "NH",
    name: "New Hampshire",
    overrides: [
      {
        federal_id: "snap",
        local_name: "New Hampshire SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "New Hampshire Granite Advantage",
        phone: "603-271-6110",
      },
      {
        federal_id: "tanf",
        local_name: "NH FAP (Financial Assistance Program)",
      },
    ],
    unique_programs: []
  },
  NV: {
    code: "NV",
    name: "Nevada",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Nevada SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "Nevada Medicaid",
        phone: "702-382-4663",
      },
      {
        federal_id: "tanf",
        local_name: "Nevada TANF",
      },
    ],
    unique_programs: []
  },
  PR: {
    code: "PR",
    name: "Puerto Rico",
    overrides: [
      {
        federal_id: "snap",
        local_name: "NAP (Nutrition Assistance Program)",
      },
      {
        federal_id: "medicaid",
        local_name: "Mi Salud",
      },
      {
        federal_id: "tanf",
        local_name: "TANF Puerto Rico",
      },
    ],
    unique_programs: []
  },
  RI: {
    code: "RI",
    name: "Rhode Island",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Rhode Island SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "RIte Care",
      },
      {
        federal_id: "tanf",
        local_name: "Rhode Island Works",
      },
    ],
    unique_programs: []
  },
  SD: {
    code: "SD",
    name: "South Dakota",
    overrides: [
      {
        federal_id: "snap",
        local_name: "South Dakota SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "South Dakota Medicaid",
        phone: "605-867-5131",
      },
      {
        federal_id: "tanf",
        local_name: "South Dakota TANF",
      },
    ],
    unique_programs: []
  },
  UT: {
    code: "UT",
    name: "Utah",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Utah SNAP",
        phone: "801-526-4400",
      },
      {
        federal_id: "medicaid",
        local_name: "Utah Medicaid",
        phone: "800-662-9651",
      },
      {
        federal_id: "tanf",
        local_name: "Utah FEP",
      },
    ],
    unique_programs: []
  },
  VI: {
    code: "VI",
    name: "US Virgin Islands",
    overrides: [
      {
        federal_id: "snap",
        local_name: "USVI SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "USVI Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "USVI TANF",
      },
    ],
    unique_programs: []
  },
  VT: {
    code: "VT",
    name: "Vermont",
    overrides: [
      {
        federal_id: "snap",
        local_name: "3SquaresVT",
      },
      {
        federal_id: "medicaid",
        local_name: "Green Mountain Care/Vermont Health Connect",
      },
      {
        federal_id: "tanf",
        local_name: "Reach Up",
      },
    ],
    unique_programs: []
  },
  WV: {
    code: "WV",
    name: "West Virginia",
    overrides: [
      {
        federal_id: "snap",
        local_name: "West Virginia SNAP",
      },
      {
        federal_id: "medicaid",
        local_name: "West Virginia Medicaid",
      },
      {
        federal_id: "tanf",
        local_name: "WV Works",
      },
    ],
    unique_programs: []
  },
  WY: {
    code: "WY",
    name: "Wyoming",
    overrides: [
      {
        federal_id: "snap",
        local_name: "Wyoming SNAP",
        phone: "307-777-6312",
      },
      {
        federal_id: "medicaid",
        local_name: "Wyoming Medicaid (EqualityCare)",
        phone: "307-777-7531",
      },
      {
        federal_id: "tanf",
        local_name: "POWER (Personal Opportunities With Employment Responsibilities)",
      },
    ],
    unique_programs: []
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MERGE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply state overlay to a federal program, returning a localized version.
 */
export function applyOverlay(
  federal: BenefitProgram,
  overlay: StateOverlay
): BenefitProgram {
  const override = overlay.overrides.find(o => o.federal_id === federal.id);
  if (!override) return federal;

  return {
    ...federal,
    name: override.local_name || federal.name,
    short_name: override.local_short_name || federal.short_name,
    phone: override.phone || federal.phone,
    website: override.website || federal.website,
    how_to_apply: override.how_to_apply || federal.how_to_apply,
    note: [federal.note, override.state_note].filter(Boolean).join(" ") || undefined,
  };
}

/**
 * Convert a state-unique program to a BenefitProgram.
 */
export function stateUniqueToBenefitProgram(
  unique: StateUniqueProgram,
  stateCode: StateCode
): BenefitProgram {
  return {
    ...unique,
    availability: "state_varies" as const,
    note: unique.note || `Available in ${stateCode} only.`,
  };
}

/**
 * Get all benefit programs for a specific state, merging federal baseline with state overlays.
 * Returns: localized federal programs + state-unique programs.
 */
export function getStateBenefits(
  federalPrograms: BenefitProgram[],
  stateCode: StateCode
): BenefitProgram[] {
  const overlay = STATE_OVERLAYS[stateCode];
  if (!overlay) return federalPrograms;

  // Apply overrides to federal programs
  const localized = federalPrograms.map(p => applyOverlay(p, overlay));

  // Add state-unique programs
  const uniquePrograms = overlay.unique_programs.map(u =>
    stateUniqueToBenefitProgram(u, stateCode)
  );

  return [...localized, ...uniquePrograms];
}

/**
 * Get state overlay metadata (portal, phone, etc.) for display.
 */
export function getStateInfo(stateCode: StateCode): {
  name: string;
  code: StateCode;
  portal?: string;
  portalName?: string;
  phone?: string;
  hasOverlay: boolean;
} {
  const overlay = STATE_OVERLAYS[stateCode];
  if (!overlay) {
    // Return basic info for states without overlays
    const nameEntry = Object.entries(STATE_NAMES).find(([, code]) => code === stateCode);
    return {
      name: nameEntry ? nameEntry[0].replace(/\b\w/g, c => c.toUpperCase()) : stateCode,
      code: stateCode,
      hasOverlay: false,
    };
  }

  return {
    name: overlay.name,
    code: overlay.code,
    portal: overlay.benefits_portal,
    portalName: overlay.benefits_portal_name,
    phone: overlay.main_phone,
    hasOverlay: true,
  };
}

/**
 * Get list of all states with overlays.
 */
export function getStatesWithOverlays(): StateCode[] {
  return Object.keys(STATE_OVERLAYS) as StateCode[];
}

/**
 * Get all 50 states + DC for the state selector.
 */
export function getAllStates(): { code: StateCode; name: string }[] {
  const stateList: { code: StateCode; name: string }[] = [];
  const seen = new Set<string>();

  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (seen.has(code)) continue;
    // Skip alternate names like "washington dc", "d.c.", "cnmi", "virgin islands" (without "u.s.")
    const multiWordPrefixes = ["new", "north", "south", "west", "rhode", "district", "puerto", "american", "northern", "u.s."];
    if (name.includes(".") && !name.startsWith("u.s.")) continue;
    if (name === "cnmi" || name === "virgin islands" || name === "us virgin islands") continue;
    if (name.includes(" ") && !multiWordPrefixes.some(p => name.startsWith(p))) continue;
    seen.add(code);
    stateList.push({
      code: code as StateCode,
      name: name.replace(/\b\w/g, c => c.toUpperCase()),
    });
  }

  return stateList.sort((a, b) => a.name.localeCompare(b.name));
}
