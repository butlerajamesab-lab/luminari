/**
 * Luminari — Benefits Navigator Engine
 *
 * Bridges the gap between government assistance programs and the people
 * who need them. When someone describes their situation — or when the
 * intake auto-detection identifies their pipeline — this engine surfaces
 * every benefit program they might be eligible for.
 *
 * Architecture:
 *   1. Program Registry: 284 federal/state/tribal/nonprofit programs loaded from JSON
 *   2. Situation Signals: Keywords, categories, and life events that trigger matches
 *   3. Matching Engine: Scores programs against user context (situation + pipeline + demographics)
 *   4. Document Checklists: Per-program lists of what you need to apply
 *   5. Contact Info: Phone numbers, websites, and how-to-apply guidance
 *
 * Design principle: If someone is in crisis, they shouldn't have to Google anything.
 * The system should say: "Here's what you may be eligible for. Here's what you need.
 * Here's the phone number. Here's the deadline."
 */

import { readFileSync } from "fs";
import { join } from "path";

import {
  detectState as _detectState,
  getStateBenefits,
  getStateInfo as _getStateInfo,
  getAllStates as _getAllStates,
  getStatesWithOverlays as _getStatesWithOverlays,
  type StateCode,
} from "./benefits-state-overlays";

// Re-export state functions for convenience
export { _detectState as detectState, _getStateInfo as getStateInfo, _getAllStates as getAllStates, _getStatesWithOverlays as getStatesWithOverlays };
export type { StateCode };

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Urgency level for a benefit program. */
export type UrgencyLevel = "immediate" | "soon" | "when_ready";

/** Category of benefit program. */
export type BenefitCategory =
  | "food"
  | "healthcare"
  | "housing"
  | "utilities"
  | "cash_assistance"
  | "burial_bereavement"
  | "elder_care"
  | "domestic_violence"
  | "disability"
  | "veterans"
  | "children_families"
  | "tribal_indigenous"
  | "immigration"
  | "legal_aid"
  | "lgbtq"
  | "community_navigation"
  | "crisis_hotline";

/** A single benefit program. */
export interface BenefitProgram {
  id: string;
  name: string;
  short_name: string;
  category: BenefitCategory;
  description: string;
  /** Plain-language explanation of what this program does. */
  what_it_does: string;
  /** Who is eligible — in plain language. */
  who_qualifies: string;
  /** Income threshold if applicable (e.g., "130% FPL", "50% AMI"). */
  income_threshold?: string;
  /** How to apply — step by step. */
  how_to_apply: string[];
  /** Phone number(s) to call. */
  phone?: string;
  /** Website URL. */
  website?: string;
  /** Documents needed to apply. */
  documents_needed: string[];
  /** Important deadlines or time limits. */
  deadlines?: string;
  /** Maximum benefit amount if known. */
  max_benefit?: string;
  /** Urgency — how quickly should someone apply? */
  urgency: UrgencyLevel;
  /** Situation signals that trigger this program. */
  situation_signals: string[];
  /** Pipeline categories from Luminari that map to this program. */
  pipeline_categories: string[];
  /** Specific pipeline IDs that strongly correlate. */
  pipeline_ids: string[];
  /** Life event triggers (e.g., "death_of_family_member", "job_loss"). */
  life_events: string[];
  /** Whether this is available nationwide or state-specific. */
  availability: "nationwide" | "state_varies" | "tribal_only";
  /** Plain-language note about the program. */
  note?: string;
  /** Government layer (federal, state, tribal, nonprofit, etc.). */
  layer?: string;
  /** Administering agency. */
  agency?: string;
}

/** Result of benefit matching. */
export interface BenefitMatch {
  program: BenefitProgram;
  relevance_score: number;
  match_reasons: string[];
  urgency: UrgencyLevel;
  /** If a state was detected, which state. */
  state_detected?: string;
  /** Whether this program has been localized for the detected state. */
  is_localized?: boolean;
}

/** Input for benefit matching. */
export interface BenefitMatchInput {
  /** Free text description of the situation. */
  situation_text?: string;
  /** Detected pipeline category from auto-detection. */
  pipeline_category?: string;
  /** Detected pipeline ID from auto-detection. */
  pipeline_id?: string;
  /** Life events mentioned or detected. */
  life_events?: string[];
  /** Explicitly provided state code (overrides auto-detection). */
  state_code?: string;
  /** Demographics if known. */
  demographics?: {
    has_children?: boolean;
    is_elderly?: boolean;
    is_veteran?: boolean;
    is_disabled?: boolean;
    is_tribal?: boolean;
    is_immigrant?: boolean;
    is_pregnant?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM REGISTRY — Loaded from JSON
// ═══════════════════════════════════════════════════════════════════════════════

function loadRegistry(): BenefitProgram[] {
  const filePath = join(import.meta.dirname, "config", "benefits_registry.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return data.programs as BenefitProgram[];
  } catch (error: any) {
    console.warn(`[Benefits] Registry unavailable at startup: ${error?.message ?? error}`);
    return [];
  }
}

export const BENEFIT_PROGRAMS: BenefitProgram[] = loadRegistry();

// ═══════════════════════════════════════════════════════════════════════════════
// LIFE EVENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const LIFE_EVENT_SIGNALS: Record<string, string[]> = {
  death_of_family_member: ["death", "died", "passed away", "funeral", "burial", "deceased", "dying", "passing", "lost", "grief", "mourning", "hospice", "terminal"],
  death_of_spouse: ["widow", "widower", "lost my husband", "lost my wife", "spouse died", "partner died"],
  death_of_veteran: ["veteran died", "veteran passed", "military funeral", "VA burial"],
  job_loss: ["fired", "laid off", "lost my job", "unemployed", "terminated", "downsized", "let go", "no work"],
  divorce: ["divorce", "divorcing", "separated", "separation", "ex-husband", "ex-wife", "ex-spouse", "custody"],
  domestic_violence: ["abuse", "abusive", "hitting", "beating", "domestic violence", "DV", "controlling", "threatening", "afraid of partner", "restraining order"],
  disability_onset: ["disabled", "disability", "injured", "can't work", "wheelchair", "chronic illness", "diagnosis"],
  pregnancy: ["pregnant", "expecting", "baby on the way", "prenatal"],
  new_baby: ["new baby", "newborn", "just had a baby", "infant"],
  homelessness: ["homeless", "no place to stay", "sleeping outside", "shelter", "couch surfing", "car"],
  eviction: ["eviction", "evicted", "kicked out", "notice to vacate", "30 days to leave"],
  aging_parent: ["aging parent", "elderly parent", "mom is getting old", "dad is getting old", "grandpa", "grandma", "nursing home", "assisted living", "can't care for themselves"],
  elder_health_decline: ["falling", "fell", "dementia", "alzheimer", "can't remember", "confusion", "decline", "deteriorating"],
  natural_disaster: ["flood", "fire", "hurricane", "tornado", "earthquake", "disaster", "storm damage"],
  immigration_crisis: ["deportation", "detained", "ICE", "immigration", "undocumented", "visa expired"],
  crime_victimization: ["robbed", "mugged", "assaulted", "attacked", "shot", "stabbed", "crime victim"],
  sexual_assault: ["raped", "sexual assault", "molested", "sexual abuse"],
  workplace_injury: ["hurt at work", "work injury", "injured on the job", "workers comp"],
  military_discharge: ["discharged", "veteran", "left the military", "DD-214"],
  caregiver_burnout: ["caregiver", "taking care of", "exhausted", "can't do this alone", "burnout"],
  turning_65: ["turning 65", "about to turn 65", "65th birthday"],
  crisis: ["crisis", "emergency", "desperate", "can't cope", "breaking point", "suicidal", "want to die"],
  mental_health_emergency: ["mental health", "breakdown", "panic", "anxiety", "depression", "psychosis"],
  consumer_fraud: ["scam", "scammed", "fraud", "ripped off", "identity theft", "stolen identity"]
};

// ═══════════════════════════════════════════════════════════════════════════════
// MATCHING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect life events from free text.
 */
export function detectLifeEvents(text: string): string[] {
  const normalized = text.toLowerCase();
  const detected: string[] = [];

  for (const [event, signals] of Object.entries(LIFE_EVENT_SIGNALS)) {
    for (const signal of signals) {
      if (normalized.includes(signal)) {
        detected.push(event);
        break;
      }
    }
  }

  return detected;
}

/**
 * Detect demographic signals from free text.
 */
export function detectDemographics(text: string): BenefitMatchInput["demographics"] {
  const normalized = text.toLowerCase();
  return {
    has_children: /\b(child|children|kids|son|daughter|baby|infant|toddler|pregnant)\b/.test(normalized),
    is_elderly: /\b(elderly|senior|65|70|80|90|old|aging|grandpa|grandma|grandfather|grandmother|retired|retirement)\b/.test(normalized),
    is_veteran: /\b(veteran|military|served|army|navy|marines|air force|coast guard|national guard|DD-214|VA |combat|deployment)\b/.test(normalized),
    is_disabled: /\b(disabled|disability|wheelchair|blind|deaf|chronic|impairment|handicap|ADA)\b/.test(normalized),
    is_tribal: /\b(tribal|native|indigenous|reservation|Indian|First Nations|Native American|Alaska Native)\b/.test(normalized),
    is_immigrant: /\b(immigrant|immigration|undocumented|visa|green card|asylum|refugee|deportation|ICE)\b/.test(normalized),
    is_pregnant: /\b(pregnant|expecting|prenatal|baby on the way|maternity)\b/.test(normalized),
  };
}

/**
 * Match benefit programs to a user's situation.
 *
 * Returns programs sorted by relevance, with match reasons explaining
 * why each program was suggested.
 */
export function matchBenefits(input: BenefitMatchInput): BenefitMatch[] {
  const allText = [
    input.situation_text,
    input.pipeline_category,
    input.pipeline_id,
  ].filter(Boolean).join(" ").toLowerCase();

  // Detect life events from text
  const detectedEvents = input.life_events?.length
    ? input.life_events
    : detectLifeEvents(allText);

  // Detect demographics from text
  const demographics = input.demographics || detectDemographics(allText);

  // Detect state from text or use explicitly provided state
  const detectedStateCode = input.state_code || _detectState(input.situation_text || "");

  // Get programs — localized if state detected, otherwise federal baseline
  const programs = detectedStateCode
    ? getStateBenefits(BENEFIT_PROGRAMS, detectedStateCode as StateCode)
    : BENEFIT_PROGRAMS;

  const matches: BenefitMatch[] = [];

  for (const program of programs) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Situation signal matching (keyword match)
    for (const signal of program.situation_signals) {
      if (allText.includes(signal.toLowerCase())) {
        score += 3;
        reasons.push(`Matches your situation: "${signal}"`);
      }
    }

    // 2. Pipeline category matching
    if (input.pipeline_category) {
      const normalizedCat = input.pipeline_category.toLowerCase().replace(/[\s&]+/g, "_");
      for (const cat of program.pipeline_categories) {
        if (normalizedCat.includes(cat) || cat.includes(normalizedCat)) {
          score += 5;
          reasons.push(`Relevant to ${input.pipeline_category} cases`);
          break;
        }
      }
    }

    // 3. Pipeline ID matching
    if (input.pipeline_id) {
      if (program.pipeline_ids.includes(input.pipeline_id)) {
        score += 7;
        reasons.push(`Directly related to your case type`);
      }
    }

    // 4. Life event matching
    for (const event of detectedEvents) {
      if (program.life_events.includes(event)) {
        score += 4;
        const eventLabel = event.replace(/_/g, " ");
        reasons.push(`Relevant to ${eventLabel}`);
      }
    }

    // 5. Demographic matching — category-based boosting
    if (demographics) {
      if (demographics.has_children && program.category === "children_families") {
        score += 3;
        reasons.push("You have children who may benefit");
      }
      if (demographics.is_elderly && (program.category === "elder_care" || ["medicare", "medicaid_ltc", "pace"].includes(program.id))) {
        score += 3;
        reasons.push("Relevant for seniors and their families");
      }
      if (demographics.is_veteran && (program.category === "veterans" || ["va_burial"].includes(program.id))) {
        score += 5;
        reasons.push("Available to veterans and their families");
      }
      if (demographics.is_disabled && (program.category === "disability" || ["ssi", "ssdi"].includes(program.id))) {
        score += 3;
        reasons.push("Relevant for people with disabilities");
      }
      if (demographics.is_tribal && (program.category === "tribal_indigenous")) {
        score += 5;
        reasons.push("Available to tribal members");
      }
      if (demographics.is_immigrant && (program.category === "immigration")) {
        score += 5;
        reasons.push("Relevant for immigration situations");
      }
      if (demographics.is_pregnant && ["wic", "medicaid"].includes(program.id)) {
        score += 3;
        reasons.push("Available for pregnant women");
      }
    }

    // Only include programs with a meaningful score
    if (score >= 3) {
      // Deduplicate reasons
      const uniqueReasons = Array.from(new Set(reasons));
      matches.push({
        program,
        relevance_score: score,
        match_reasons: uniqueReasons.slice(0, 4), // Top 4 reasons
        urgency: program.urgency,
        state_detected: detectedStateCode || undefined,
        is_localized: !!detectedStateCode,
      });
    }
  }

  // Sort by relevance score (descending), then urgency
  const urgencyOrder: Record<UrgencyLevel, number> = { immediate: 0, soon: 1, when_ready: 2 };
  matches.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  return matches;
}

/**
 * Get all benefit programs in a specific category.
 */
export function getBenefitsByCategory(category: BenefitCategory): BenefitProgram[] {
  return BENEFIT_PROGRAMS.filter(p => p.category === category);
}

/**
 * Get a specific benefit program by ID.
 */
export function getBenefitById(id: string): BenefitProgram | undefined {
  return BENEFIT_PROGRAMS.find(p => p.id === id);
}

/**
 * Get all available benefit categories with counts.
 */
export function getBenefitCategories(): { category: BenefitCategory; label: string; count: number }[] {
  const categoryLabels: Record<BenefitCategory, string> = {
    food: "Food Assistance",
    healthcare: "Healthcare",
    housing: "Housing",
    utilities: "Utilities & Communications",
    cash_assistance: "Cash Assistance & Income",
    burial_bereavement: "Burial & Bereavement",
    elder_care: "Elder Care",
    domestic_violence: "Domestic Violence & Safety",
    disability: "Disability Services",
    veterans: "Veterans Services",
    children_families: "Children & Families",
    tribal_indigenous: "Tribal & Indigenous",
    immigration: "Immigration",
    legal_aid: "Legal Aid",
    lgbtq: "LGBTQ+ Community",
    community_navigation: "Community Navigation",
    crisis_hotline: "Crisis Hotlines",
  };

  const counts: Record<string, number> = {};
  for (const program of BENEFIT_PROGRAMS) {
    counts[program.category] = (counts[program.category] || 0) + 1;
  }

  return Object.entries(categoryLabels).map(([cat, label]) => ({
    category: cat as BenefitCategory,
    label,
    count: counts[cat] || 0,
  }));
}

/**
 * Get document checklist for a set of matched programs.
 */
export function getDocumentChecklist(programIds: string[]): { document: string; programs: string[] }[] {
  const docMap = new Map<string, Set<string>>();

  for (const id of programIds) {
    const program = getBenefitById(id);
    if (!program) continue;

    for (const doc of program.documents_needed) {
      const normalized = doc.toLowerCase().trim();
      if (!docMap.has(normalized)) {
        docMap.set(normalized, new Set());
      }
      docMap.get(normalized)!.add(program.short_name);
    }
  }

  return Array.from(docMap.entries())
    .map(([doc, programs]) => ({
      document: doc.charAt(0).toUpperCase() + doc.slice(1),
      programs: Array.from(programs),
    }))
    .sort((a, b) => b.programs.length - a.programs.length); // Most-needed docs first
}
