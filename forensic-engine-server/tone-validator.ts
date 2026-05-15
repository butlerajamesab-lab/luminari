/**
 * Tone Compliance Validator
 * 
 * Validates AI-generated output against the 5 acceptance criteria,
 * with second-sentence enforcement and Significance field procedural-only constraint.
 * 
 * 1. Every description begins with attribution ("The [document type] states...", "Document [ID] states...")
 * 2. No banned synthesis verbs appear (in ANY sentence)
 * 3. No conclusory adjectives appear (in ANY sentence)
 * 4. No causal/inferential language beyond explicit quotes (in ANY sentence)
 * 5. Page references present and in correct format
 * 6. Significance fields contain ONLY procedural context (closed set)
 */

// ─── Banned Terms (expanded) ───

const BANNED_SYNTHESIS_VERBS = [
  "directly links", "perpetrated", "orchestrated", "masterminded", "facilitated", "enabled",
  "implicates", "incriminates", "confirms", "proves", "establishes", "demonstrates",
  "suggests", "indicates", "implies", "highlights", "reveals", "underscores", "exposes",
  "points to", "raises questions", "calls into question", "undermines", "bolsters",
  "corroborates", "contradicts",
  // Expanded: soft-synthesis verbs that migrate into second sentences
  "reinforces", "speaks to", "reflects", "connects", "ties to", "sheds light on",
  "draws attention to", "makes clear", "makes evident", "lends support to",
  "further supports", "further demonstrates", "further confirms", "further establishes",
];

const BANNED_CONCLUSORY_ADJECTIVES = [
  "clear", "obvious", "undeniable", "definitive", "damning", "incriminating",
  "shocking", "alarming", "significant", "notable", "important", "crucial",
  "critical", "key", "pivotal",
  // Expanded: additional conclusory adjectives
  "compelling", "striking", "telling", "troubling", "concerning", "disturbing", "unprecedented",
];

const BANNED_NARRATIVE_FRAMING = [
  "importantly", "notably", "significantly", "crucially", "interestingly", "remarkably",
  "which means", "this could lead to", "potentially", "likely", "appears to", "seems to",
  // Expanded: additional framing terms
  "in effect", "in other words", "essentially", "fundamentally", "ultimately",
];

const BANNED_CAUSAL_PHRASES = [
  "this reveals", "this demonstrates", "this confirms", "this proves",
  "this establishes", "this shows", "this undermines", "this bolsters",
  "as a result", "consequently", "therefore", "thus indicating",
  "making it clear", "leaving no doubt", "without question",
  // Expanded: second-sentence synthesis starters
  "this highlights", "this reinforces", "this suggests", "this indicates",
  "this implies", "this speaks to", "this reflects", "this connects",
  "this ties to", "this sheds light on", "this draws attention to",
  "this makes clear", "this makes evident", "this lends support to",
  "this further", "which highlights", "which reinforces", "which suggests",
  "which indicates", "which implies", "which confirms", "which demonstrates",
];

// ─── Attribution Patterns ───

const ATTRIBUTION_PATTERNS = [
  /^the\s+(filing|document|deposition|testimony|court\s+filing|agreement|motion|order|judgment|indictment|affidavit|complaint|petition|report|memo|letter|email|record|disclosure|exhibit|transcript)\s+(states|records|identifies|references|contains|presents|lists|names)/i,
  /^document\s+(#?\d+|states|records|identifies)/i,
  /^\[?document\s/i,
  /^[A-Z][a-z]+\s+(is\s+identified|is\s+described|is\s+named|is\s+listed|is\s+referenced)/i,
  /^this\s+(filing|document|deposition|testimony|court\s+filing|agreement|motion|order)\s+(states|records|contains|presents)/i,
];

// ─── Page Reference Pattern ───

const PAGE_REF_PATTERN = /\(p\.?\s*\d+\)|page\s+\d+|\[page\s+\d+\]/i;

// ─── Significance Field: Permitted Procedural Categories ───

const PERMITTED_SIGNIFICANCE_PATTERNS = [
  // Pass 1 assertion significance (procedural context only)
  /^factual claim/i,
  /^identification of/i,
  /^procedural notation/i,
  /^filing reference/i,
  /^jurisdictional detail/i,
  /^document classification/i,
  /^statutory reference/i,
  /^case number reference/i,
  /^docket entry/i,
  /^witness identification/i,
  // Pass 3 finding significance (cross-document procedural context only)
  /^two documents address/i,
  /^multiple documents reference/i,
  /^two documents differ/i,
  /^cross-document reference/i,
  /^multiple documents from/i,
];

// ─── Types ───

export interface ToneViolation {
  field: string;
  text: string;
  rule: "attribution" | "synthesis_verb" | "conclusory_adjective" | "causal_language" | "page_reference" | "significance_procedural";
  detail: string;
}

export interface ToneReport {
  passed: boolean;
  totalChecked: number;
  violations: ToneViolation[];
  summary: {
    attribution: { checked: number; passed: number; failed: number };
    synthesis_verbs: { checked: number; passed: number; failed: number };
    conclusory_adjectives: { checked: number; passed: number; failed: number };
    causal_language: { checked: number; passed: number; failed: number };
    page_references: { checked: number; passed: number; failed: number };
    significance_procedural: { checked: number; passed: number; failed: number };
  };
}

// ─── Validation Functions ───

function checkAttribution(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return ATTRIBUTION_PATTERNS.some(p => p.test(trimmed));
}

function findBannedSynthesisVerbs(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_SYNTHESIS_VERBS.filter(verb => lower.includes(verb));
}

function findBannedConclusions(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_CONCLUSORY_ADJECTIVES.filter(adj => {
    // Match as whole word to avoid false positives
    const regex = new RegExp(`\\b${adj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
    return regex.test(lower);
  });
}

function findBannedCausalLanguage(text: string): string[] {
  const lower = text.toLowerCase();
  return [...BANNED_NARRATIVE_FRAMING, ...BANNED_CAUSAL_PHRASES].filter(phrase => lower.includes(phrase));
}

function hasPageReference(text: string): boolean {
  return PAGE_REF_PATTERN.test(text);
}

function isProceduralSignificance(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return PERMITTED_SIGNIFICANCE_PATTERNS.some(p => p.test(trimmed));
}

// ─── Main Validator ───

interface FieldToValidate {
  field: string;
  text: string;
  requireAttribution: boolean;
  requirePageRef: boolean;
  isSignificanceField?: boolean;
}

/**
 * Validate a set of AI-generated text fields against the acceptance criteria.
 * Now includes second-sentence enforcement and Significance field procedural-only check.
 */
export function validateToneCompliance(fields: FieldToValidate[]): ToneReport {
  const violations: ToneViolation[] = [];
  const summary = {
    attribution: { checked: 0, passed: 0, failed: 0 },
    synthesis_verbs: { checked: 0, passed: 0, failed: 0 },
    conclusory_adjectives: { checked: 0, passed: 0, failed: 0 },
    causal_language: { checked: 0, passed: 0, failed: 0 },
    page_references: { checked: 0, passed: 0, failed: 0 },
    significance_procedural: { checked: 0, passed: 0, failed: 0 },
  };

  for (const { field, text, requireAttribution, requirePageRef, isSignificanceField } of fields) {
    if (!text || text.trim().length === 0) continue;

    // 1. Attribution check
    if (requireAttribution) {
      summary.attribution.checked++;
      if (checkAttribution(text)) {
        summary.attribution.passed++;
      } else {
        summary.attribution.failed++;
        violations.push({
          field,
          text: text.slice(0, 200),
          rule: "attribution",
          detail: `Description does not begin with attribution pattern (e.g., "The filing states...", "Document X states...")`,
        });
      }
    }

    // 2. Synthesis verb check (applies to ALL sentences in the field)
    summary.synthesis_verbs.checked++;
    const foundVerbs = findBannedSynthesisVerbs(text);
    if (foundVerbs.length === 0) {
      summary.synthesis_verbs.passed++;
    } else {
      summary.synthesis_verbs.failed++;
      violations.push({
        field,
        text: text.slice(0, 200),
        rule: "synthesis_verb",
        detail: `Banned synthesis verbs found: ${foundVerbs.join(", ")}`,
      });
    }

    // 3. Conclusory adjective check (applies to ALL sentences)
    summary.conclusory_adjectives.checked++;
    const foundAdj = findBannedConclusions(text);
    if (foundAdj.length === 0) {
      summary.conclusory_adjectives.passed++;
    } else {
      summary.conclusory_adjectives.failed++;
      violations.push({
        field,
        text: text.slice(0, 200),
        rule: "conclusory_adjective",
        detail: `Banned conclusory adjectives found: ${foundAdj.join(", ")}`,
      });
    }

    // 4. Causal/inferential language check (applies to ALL sentences)
    summary.causal_language.checked++;
    const foundCausal = findBannedCausalLanguage(text);
    if (foundCausal.length === 0) {
      summary.causal_language.passed++;
    } else {
      summary.causal_language.failed++;
      violations.push({
        field,
        text: text.slice(0, 200),
        rule: "causal_language",
        detail: `Banned causal/inferential language found: ${foundCausal.join(", ")}`,
      });
    }

    // 5. Page reference check
    if (requirePageRef) {
      summary.page_references.checked++;
      if (hasPageReference(text)) {
        summary.page_references.passed++;
      } else {
        summary.page_references.failed++;
        violations.push({
          field,
          text: text.slice(0, 200),
          rule: "page_reference",
          detail: `Missing page reference (expected format: "(p.X)" or "Page X")`,
        });
      }
    }

    // 6. Significance field procedural-only check
    if (isSignificanceField) {
      summary.significance_procedural.checked++;
      // Check that it matches a permitted pattern AND has no banned terms
      const isProcedural = isProceduralSignificance(text);
      const hasBannedVerbs = findBannedSynthesisVerbs(text).length > 0;
      const hasBannedAdj = findBannedConclusions(text).length > 0;
      const hasBannedCausal = findBannedCausalLanguage(text).length > 0;

      if (isProcedural && !hasBannedVerbs && !hasBannedAdj && !hasBannedCausal) {
        summary.significance_procedural.passed++;
      } else {
        summary.significance_procedural.failed++;
        const reasons: string[] = [];
        if (!isProcedural) reasons.push("does not match any permitted procedural category");
        if (hasBannedVerbs) reasons.push("contains banned synthesis verbs");
        if (hasBannedAdj) reasons.push("contains banned conclusory adjectives");
        if (hasBannedCausal) reasons.push("contains banned causal language");
        violations.push({
          field,
          text: text.slice(0, 200),
          rule: "significance_procedural",
          detail: `Significance field violation: ${reasons.join("; ")}. Must be purely procedural context (e.g., "Factual claim about a date", "Two documents address the same event").`,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    totalChecked: fields.length,
    violations,
    summary,
  };
}

/**
 * Validate the output of a full document re-analysis (Pass 1 + Pass 2 results).
 * Returns a tone report covering all generated descriptions.
 */
export function validateDocumentOutput(pass1: any, pass2: any): ToneReport {
  const fields: FieldToValidate[] = [];

  // Pass 1: document_purpose
  if (pass1?.document_purpose) {
    fields.push({ field: "document_purpose", text: pass1.document_purpose, requireAttribution: true, requirePageRef: false });
  }

  // Pass 1: entity descriptions
  for (const entity of (pass1?.entities || [])) {
    if (entity.description) {
      fields.push({ field: `entity.${entity.name}.description`, text: entity.description, requireAttribution: true, requirePageRef: true });
    }
  }

  // Pass 1: key assertions
  for (let i = 0; i < (pass1?.key_assertions || []).length; i++) {
    const a = pass1.key_assertions[i];
    if (a.assertion) {
      fields.push({ field: `assertion[${i}]`, text: a.assertion, requireAttribution: true, requirePageRef: true });
    }
    if (a.significance) {
      fields.push({ field: `assertion[${i}].significance`, text: a.significance, requireAttribution: false, requirePageRef: false, isSignificanceField: true });
    }
  }

  // Pass 2: event descriptions
  for (let i = 0; i < (pass2?.events || []).length; i++) {
    const e = pass2.events[i];
    if (e.description) {
      fields.push({ field: `event[${i}].description`, text: e.description, requireAttribution: true, requirePageRef: true });
    }
    if (e.title) {
      fields.push({ field: `event[${i}].title`, text: e.title, requireAttribution: false, requirePageRef: false });
    }
  }

  // Pass 2: relationship descriptions
  for (let i = 0; i < (pass2?.relationships || []).length; i++) {
    const r = pass2.relationships[i];
    if (r.description) {
      fields.push({ field: `relationship[${i}].description`, text: r.description, requireAttribution: true, requirePageRef: true });
    }
  }

  // Pass 2: claim texts
  for (let i = 0; i < (pass2?.claims || []).length; i++) {
    const c = pass2.claims[i];
    if (c.text) {
      fields.push({ field: `claim[${i}].text`, text: c.text, requireAttribution: true, requirePageRef: true });
    }
  }

  // Pass 2: signal flag descriptions
  for (let i = 0; i < (pass2?.signal_flags || []).length; i++) {
    const f = pass2.signal_flags[i];
    if (f.description) {
      fields.push({ field: `signal_flag[${i}].description`, text: f.description, requireAttribution: true, requirePageRef: true });
    }
  }

  return validateToneCompliance(fields);
}
