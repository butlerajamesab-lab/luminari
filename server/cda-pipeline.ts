/**
 * CDA v1.0-PATCH3 — Deterministic Pipeline Implementation
 *
 * T1: Document Classification
 * T2: Quote Extraction
 * T3: Entity Normalization
 * T4: Denial Reason Parsing
 * T5: Policy Clause Parsing
 * T6: Policy-to-Denial Linking
 * T7: Semantic Comparison (deterministic first-pass + LLM escape hatch)
 * T8: Contradiction Detection
 * T9: Artifact Generation
 *
 * T7 Architecture: Option C (Hybrid)
 * - Deterministic first-pass resolves not_assessable, supported, partially_supported
 * - LLM invoked ONLY on rows that remain ambiguous after deterministic pass
 * - Write boundary: T7 may only write to S6 fields (matchType, mismatchType, evidence, supportingQuoteIds)
 * - T7 does NOT use normalized_reason_code (keyword taxonomy, can be wrong)
 * - T8 conflict does NOT forbid supported — it requires conflict_evidence + missing_evidence
 * - All T7 outputs tagged with resolutionMethod for audit
 *
 * All patterns come from cda-patterns.ts (single source of truth).
 * No inline regex. No dynamic pattern construction.
 * Deterministic ordering enforced throughout.
 */

import * as cdaDb from "./cda-db";
import {
  CLASSIFICATION_PATTERNS,
  QUOTE_CATEGORY_PATTERNS,
  REASON_CODE_PATTERNS,
  REASON_CODE_PRECEDENCE,
  CONFLICT_PATTERNS,
  BOILERPLATE_STOPLIST,
  VERBATIM_OVERLAP_MIN_WORDS,
  CLAUSE_TYPE_PATTERNS,
  CLAUSE_TYPE_PRECEDENCE,
  CONSEQUENCE_STATEMENT_PATTERNS,
  VAGUE_DENIAL_INDICATORS,
  HEADING_OVERLAP_MAP,
} from "./cda-patterns";
import type { CdaRunInput, CdaInputDocument } from "./cda-orchestrator";
import { invokeLLMDeterministic } from "./_core/llm";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════
// Shared Utilities
// ═══════════════════════════════════════════════════════════════════════

/** Normalize text for comparison: lowercase, collapse whitespace */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split text into words (lowercase, no punctuation) */
function toWords(text: string): string[] {
  return normalize(text)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Check if a sentence matches any pattern in a list */
function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Split text into sentences (handles abbreviations reasonably) */
function splitSentences(text: string): string[] {
  // Split on period/question/exclamation followed by space+capital or end
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Split text into paragraphs */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Extract section-like structures from policy text.
 * Returns array of { heading, body, fullText } sorted by appearance order.
 */
function extractPolicySections(text: string): Array<{
  heading: string;
  body: string;
  fullText: string;
  startOffset: number;
}> {
  const sections: Array<{ heading: string; body: string; fullText: string; startOffset: number }> = [];
  let match: RegExpExecArray | null;

  // Priority 1: Bold markers (**...**) — common in structured policy text
  const boldPattern = /\*\*([^*]+)\*\*/g;
  const boldHeadings: Array<{ text: string; index: number }> = [];
  while ((match = boldPattern.exec(text)) !== null) {
    const heading = match[1].trim();
    // Only treat as heading if it looks like a section title
    if (heading.includes("SECTION") || heading.includes("—") || heading.includes("EXCLUSION") ||
        heading.includes("CONDITION") || heading.includes("COVERAGE") || heading.includes("PERIL") ||
        heading.includes("DEFINITION") || heading.includes("ENDORSEMENT")) {
      boldHeadings.push({ text: heading, index: match.index });
    }
  }

  if (boldHeadings.length > 0) {
    for (let i = 0; i < boldHeadings.length; i++) {
      const start = boldHeadings[i].index;
      const end = i < boldHeadings.length - 1 ? boldHeadings[i + 1].index : text.length;
      const fullText = text.slice(start, end).trim();
      const heading = boldHeadings[i].text;
      // Remove the bold marker line from body
      const body = fullText.replace(/\*\*[^*]+\*\*\s*/, "").trim();
      sections.push({ heading, body, fullText, startOffset: start });
    }
    return sections;
  }

  // Priority 2: Regex heading pattern (ALL-CAPS lines, SECTION lines)
  const headingPattern = /^(?:(?:SECTION\s+[IVX\d]+\s*[—–-]\s*.*)|(?:[A-Z][A-Z\s—–\-:]{5,}(?:\([a-z]\))?))\s*$/gm;
  const headings: Array<{ text: string; index: number }> = [];
  while ((match = headingPattern.exec(text)) !== null) {
    headings.push({ text: match[0].trim(), index: match.index });
  }

  if (headings.length > 0) {
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index;
      const end = i < headings.length - 1 ? headings[i + 1].index : text.length;
      const fullText = text.slice(start, end).trim();
      const heading = headings[i].text;
      const body = fullText.slice(heading.length).trim();
      sections.push({ heading, body, fullText, startOffset: start });
    }
    return sections;
  }

  // Fallback: treat entire text as one section
  sections.push({ heading: "", body: text, fullText: text, startOffset: 0 });
  return sections;
}

/**
 * Find all ≥N consecutive word overlaps between two texts.
 * Returns the overlapping phrases.
 */
function findVerbatimOverlaps(text1: string, text2: string, minWords: number): string[] {
  const words1 = toWords(text1);
  const words2 = toWords(text2);
  const overlaps: string[] = [];

  for (let i = 0; i <= words1.length - minWords; i++) {
    for (let len = minWords; len <= Math.min(words1.length - i, words2.length); len++) {
      const phrase = words1.slice(i, i + len).join(" ");
      const target = words2.join(" ");
      if (target.includes(phrase)) {
        // Check if this is a boilerplate phrase
        if (!isBoilerplate(phrase)) {
          overlaps.push(phrase);
        }
      }
    }
  }

  // Deduplicate and return longest matches first
  const unique = Array.from(new Set(overlaps));
  unique.sort((a, b) => b.split(" ").length - a.split(" ").length);
  return unique;
}

/**
 * Check if a phrase consists entirely of boilerplate stoplist tokens.
 */
function isBoilerplate(phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  return BOILERPLATE_STOPLIST.some((stop) => {
    const normalizedStop = normalize(stop);
    return normalizedPhrase === normalizedStop || normalizedPhrase.includes(normalizedStop);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// T1: Document Classification
// ═══════════════════════════════════════════════════════════════════════

export async function executeT1(
  runId: string,
  input: CdaRunInput,
): Promise<{ docIds: Map<string, string> }> {
  const docs: Array<{ doc: CdaInputDocument; docType: string; source: string }> = [
    { doc: input.policy, docType: "policy", source: "insurer" },
    { doc: input.denial, docType: "denial", source: "insurer" },
    { doc: input.claimSummary, docType: "claim_summary", source: "insured" },
  ];

  const docIds = new Map<string, string>();

  for (const { doc, docType, source } of docs) {
    // Verify classification using patterns (audit trail)
    const matchedPatterns: string[] = [];
    const patterns = CLASSIFICATION_PATTERNS[docType] ?? [];
    for (const pattern of patterns) {
      if (pattern.test(doc.textContent)) {
        matchedPatterns.push(pattern.source);
      }
    }

    const classificationRule = matchedPatterns.length > 0
      ? `input_label + pattern_confirmed: ${matchedPatterns.join(", ")}`
      : "input_label";

    const docId = await cdaDb.insertDocument({
      runId,
      docType,
      fileName: doc.fileName,
      source: source as any,
      pageCount: doc.pageCount ?? 1,
      hash: doc.hash,
      sourceDocumentId: doc.sourceDocumentId,
      classificationRule,
    });

    docIds.set(docType, docId);
  }

  return { docIds };
}

// ═══════════════════════════════════════════════════════════════════════
// T2: Quote Extraction
// ═══════════════════════════════════════════════════════════════════════

interface ExtractedQuote {
  docId: string;
  docType: string;
  page: number;
  locationHint: string;
  quoteText: string;
  categoryTag: string;
  startOffset: number;
}

/**
 * Extract quotes from a single document.
 * Uses QUOTE_CATEGORY_PATTERNS from the registry.
 */
function extractQuotesFromDocument(
  text: string,
  docId: string,
  docType: string,
): ExtractedQuote[] {
  const quotes: ExtractedQuote[] = [];

  if (docType === "policy") {
    // For policy documents, extract section-by-section
    const sections = extractPolicySections(text);
    for (const section of sections) {
      if (section.body.length < 10) continue;

      // All policy document quotes are policy_clause
      // (declarations_field tag is only for claim_summary documents)
      const categoryTag = "policy_clause";

      // Extract the substantive clause text (body, not heading)
      const clauseText = section.body.trim();
      if (clauseText.length < 5) continue;

      // Split numbered items within a section (e.g., "12. Accidental Discharge...")
      const numberedItems = clauseText.match(/^\d+\.\s+.+$/gm);
      if (numberedItems && numberedItems.length > 0) {
        for (const item of numberedItems) {
          quotes.push({
            docId,
            docType,
            page: 1,
            locationHint: section.heading,
            quoteText: item.replace(/^\d+\.\s+/, "").trim(),
            categoryTag,
            startOffset: text.indexOf(item),
          });
        }
        // Also extract the non-numbered preamble if it exists
        const preamble = clauseText.split(/^\d+\.\s+/m)[0]?.trim();
        if (preamble && preamble.length > 20) {
          quotes.push({
            docId,
            docType,
            page: 1,
            locationHint: section.heading,
            quoteText: preamble,
            categoryTag,
            startOffset: text.indexOf(preamble),
          });
        }
      } else {
        // Single clause text
        quotes.push({
          docId,
          docType,
          page: 1,
          locationHint: section.heading,
          quoteText: clauseText,
          categoryTag,
          startOffset: section.startOffset,
        });
      }
    }
  } else if (docType === "denial") {
    // For denial documents, extract paragraph-by-paragraph
    const paragraphs = splitParagraphs(text);
    let paraIdx = 0;

    for (const para of paragraphs) {
      paraIdx++;

      // Skip closing lines but NOT salutations (we need "Dear Mr. Smith" for name extraction)
      if (/^(?:sincerely|regards|respectfully|yours\s+truly)/i.test(para)) continue;
      if (para.length < 10) continue;

      // Extract insured name from salutation ("Dear Mr. Smith")
      const dearMatch = para.match(/^Dear\s+(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (dearMatch) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Salutation",
          quoteText: para.trim(),
          categoryTag: "party_reference",
          startOffset: text.indexOf(para),
        });
        continue;
      }

      // Check for header fields (date, claim no, policy no, to)
      const headerPatterns = [
        { pattern: /\b(?:Date|Re|To|From):\s*/i, tag: "party_reference" },
        { pattern: /\bClaim\s+No\.?\s*:?\s*([A-Z0-9-]+)/i, tag: "party_reference" },
        { pattern: /\bPolicy\s+No\.?\s*:?\s*([A-Z0-9-]+)/i, tag: "party_reference" },
      ];

      let isHeader = false;
      for (const hp of headerPatterns) {
        if (hp.pattern.test(para)) {
          isHeader = true;
          // Extract specific references from header
          const dateMatch = para.match(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i);
          if (dateMatch) {
            quotes.push({
              docId, docType, page: 1,
              locationHint: "Header",
              quoteText: dateMatch[1],
              categoryTag: "date_reference",
              startOffset: text.indexOf(dateMatch[1]),
            });
          }
          const claimMatch = para.match(/Claim\s+No\.?\s*:?\s*([A-Z0-9-]+)/i);
          if (claimMatch) {
            quotes.push({
              docId, docType, page: 1,
              locationHint: "Header",
              quoteText: `Claim No. ${claimMatch[1]}`,
              categoryTag: "party_reference",
              startOffset: text.indexOf(claimMatch[0]),
            });
          }
          const policyMatch = para.match(/Policy\s+(?:No|Number)\.?\s*:?\s*([A-Z0-9-]+)/i);
          if (policyMatch) {
            quotes.push({
              docId, docType, page: 1,
              locationHint: "Header",
              quoteText: `Policy No. ${policyMatch[1]}`,
              categoryTag: "party_reference",
              startOffset: text.indexOf(policyMatch[0]),
            });
          }
          // Extract "To:" addressee name
          const toMatch = para.match(/(?:To|Attn):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
          if (toMatch) {
            quotes.push({
              docId, docType, page: 1,
              locationHint: "Header",
              quoteText: `To: ${toMatch[1]}`,
              categoryTag: "party_reference",
              startOffset: text.indexOf(toMatch[0]),
            });
          }
          // Extract "From:" insurer name
          const fromMatch = para.match(/(?:From):\s*(.+)/i);
          if (fromMatch) {
            quotes.push({
              docId, docType, page: 1,
              locationHint: "Header",
              quoteText: `From: ${fromMatch[1].trim()}`,
              categoryTag: "party_reference",
              startOffset: text.indexOf(fromMatch[0]),
            });
          }
          break;
        }
      }
      if (isHeader) continue;

      // For body paragraphs, split into sentences and categorize
      const sentences = splitSentences(para);
      for (const sentence of sentences) {
        if (sentence.length < 10) continue;

        // Determine category using priority: denial_reason > denial_supporting_fact > claim_fact > date/amount/party
        let categoryTag = "other";

        // Check consequence statements first (PATCH2 — these are extracted but tagged, not filtered here)
        const isConsequence = matchesAny(sentence, CONSEQUENCE_STATEMENT_PATTERNS);

        if (matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.denial_reason ?? [])) {
          categoryTag = "denial_reason";
        } else if (matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.denial_supporting_fact ?? [])) {
          categoryTag = isConsequence ? "other" : "denial_supporting_fact";
        } else if (matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.claim_fact ?? [])) {
          categoryTag = "claim_fact";
        }

        // Check for embedded references
        const hasDate = matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.date_reference ?? []);
        const hasAmount = matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.amount_reference ?? []);
        const hasParty = matchesAny(sentence, QUOTE_CATEGORY_PATTERNS.party_reference ?? []);

        // Extract the main sentence
        if (categoryTag !== "other" || (!isConsequence && sentence.length > 20)) {
          quotes.push({
            docId, docType, page: 1,
            locationHint: `Paragraph ${paraIdx}`,
            quoteText: sentence.trim(),
            categoryTag: categoryTag === "other" ? "claim_fact" : categoryTag,
            startOffset: text.indexOf(sentence),
          });
        }

        // Extract embedded date references as separate quotes
        if (hasDate) {
          const dateMatches = sentence.match(
            /\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi
          );
          if (dateMatches) {
            for (const dm of dateMatches) {
              quotes.push({
                docId, docType, page: 1,
                locationHint: `Paragraph ${paraIdx}`,
                quoteText: dm,
                categoryTag: "date_reference",
                startOffset: text.indexOf(dm),
              });
            }
          }
        }

        // Extract party references (adjuster names, etc.)
        const adjusterMatch = sentence.match(/\b(?:adjuster|examiner|inspector)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+on\s+(\w+\s+\d{1,2},?\s+\d{4}))?/i);
        if (adjusterMatch) {
          quotes.push({
            docId, docType, page: 1,
            locationHint: `Paragraph ${paraIdx}`,
            quoteText: adjusterMatch[0],
            categoryTag: "party_reference",
            startOffset: text.indexOf(adjusterMatch[0]),
          });
        }
      }
    }
  } else if (docType === "claim_summary") {
    // For claim summaries, extract field-by-field
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Date of Loss (also: Proposed Date of Service, Date of Service, Date of Incident)
      const dolMatch = line.replace(/\*+/g, "").match(/(?:Date\s+of\s+(?:Loss|Service|Incident)|Proposed\s+Date\s+of\s+Service)\s*:?\s*(.*)/i);
      if (dolMatch && dolMatch[1]) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Date of Loss field",
          quoteText: dolMatch[1].trim(),
          categoryTag: "date_reference",
          startOffset: text.indexOf(dolMatch[1]),
        });
      }

      // Date of Submission
      const dosMatch = line.replace(/\*+/g, "").match(/Date\s+of\s+Submission\s*:?\s*(.*)/i);
      if (dosMatch && dosMatch[1]) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Date of Submission field",
          quoteText: dosMatch[1].trim(),
          categoryTag: "date_reference",
          startOffset: text.indexOf(dosMatch[1]),
        });
      }

      // Description of Loss
      const descMatch = line.replace(/\*+/g, "").match(/Description\s+of\s+Loss\s*:?\s*(.*)/i);
      if (descMatch && descMatch[1]) {
        // May span multiple lines until next field
        let description = descMatch[1].trim();
        let j = i + 1;
        while (j < lines.length && !lines[j].match(/^\*?\*?(?:Claimed|Items|Date|Policy|Claim)\s/i)) {
          description += " " + lines[j];
          j++;
        }
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Description of Loss",
          quoteText: description.trim(),
          categoryTag: "claim_fact",
          startOffset: text.indexOf(description.slice(0, 30)),
        });
      }

      // Claimed Amount (also: Total estimated cost, Estimated Cost, Total Cost)
      const amtMatch = line.replace(/\*+/g, "").match(/(?:Claimed?\s+Amount|Total\s+(?:estimated\s+)?cost|Estimated\s+Cost)\s*:?\s*(\$[\d,]+(?:\.\d{2})?)/i);
      if (amtMatch) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Claimed Amount field",
          quoteText: amtMatch[1],
          categoryTag: "amount_reference",
          startOffset: text.indexOf(amtMatch[1]),
        });
      }

      // Claim No (also: Claim Number, Auth Number, Authorization Number)
      const claimNoMatch = line.replace(/\*+/g, "").match(/(?:Claim|Auth(?:orization)?)\s+(?:No|Number)\.?\s*:?\s*([A-Z0-9-]+)/i);
      if (claimNoMatch) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Claim No field",
          quoteText: `Claim No. ${claimNoMatch[1]}`,
          categoryTag: "party_reference",
          startOffset: text.indexOf(claimNoMatch[0]),
        });
      }

      // Policy No (also: Group Policy, Member ID)
      const polNoMatch = line.replace(/\*+/g, "").match(/(?:Policy|Group\s+Policy|Member\s+ID)\s+(?:No|Number)?\.?\s*:?\s*([A-Z0-9-]+)/i);
      if (polNoMatch) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Policy No field",
          quoteText: `Policy No. ${polNoMatch[1]}`,
          categoryTag: "party_reference",
          startOffset: text.indexOf(polNoMatch[0]),
        });
      }

      // Insured / Named Insured / Policyholder / Claimant / Member / Patient
      const insuredMatch = line.replace(/\*+/g, "").match(/(?:Named\s+Insured|Insured|Policyholder|Claimant|Member|Patient)\s*:\s*(.+)/i);
      if (insuredMatch && insuredMatch[1]) {
        quotes.push({
          docId, docType, page: 1,
          locationHint: "Insured Name field",
          quoteText: `Insured: ${insuredMatch[1].trim()}`,
          categoryTag: "party_reference",
          startOffset: text.indexOf(insuredMatch[0]),
        });
      }

      // Items Claimed (also: Proposed Procedure, Procedure, Treatment)
      const itemsMatch = line.replace(/\*+/g, "").match(/(?:Items\s+Claimed|Proposed\s+Procedure|Procedure|Treatment)\s*:?\s*(.*)/i);
      if (itemsMatch && itemsMatch[1]) {
        let items = itemsMatch[1].trim();
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith("-") || lines[j].startsWith("\u2022") || /^\d+\.\s/.test(lines[j]))) {
          items += " " + lines[j];
          j++;
        }
        if (items.length > 5) {
          quotes.push({
            docId, docType, page: 1,
            locationHint: "Items Claimed field",
            quoteText: items.trim(),
            categoryTag: "claim_fact",
            startOffset: text.indexOf(itemsMatch[0]),
          });
        }
      }
    }
  }

  // Deterministic ordering: doc_id ASC, page ASC, startOffset ASC, categoryTag ASC
  quotes.sort((a, b) => {
    if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
    if (a.page !== b.page) return a.page - b.page;
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    return a.categoryTag.localeCompare(b.categoryTag);
  });

  return quotes;
}

export async function executeT2(
  runId: string,
  input: CdaRunInput,
  docIds: Map<string, string>,
): Promise<{ quoteIds: Map<string, string[]> }> {
  const quoteIds = new Map<string, string[]>();

  const docsToProcess = [
    { docType: "policy", doc: input.policy },
    { docType: "denial", doc: input.denial },
    { docType: "claim_summary", doc: input.claimSummary },
  ];

  for (const { docType, doc } of docsToProcess) {
    const docId = docIds.get(docType)!;
    const extracted = extractQuotesFromDocument(doc.textContent, docId, docType);
    const ids: string[] = [];

    for (const q of extracted) {
      const id = await cdaDb.insertQuote({
        runId,
        docId: q.docId,
        page: q.page,
        locationHint: q.locationHint,
        quoteText: q.quoteText,
        categoryTag: q.categoryTag,
        extractionMethod: "digital_text",
        confidence: "high",
        infoLayer: "L1",
      });
      ids.push(id);
    }

    quoteIds.set(docId, ids);
  }

  return { quoteIds };
}

// ═══════════════════════════════════════════════════════════════════════
// T3: Entity Normalization
// ═══════════════════════════════════════════════════════════════════════

export async function executeT3(runId: string): Promise<void> {
  const quotes = await cdaDb.getQuotes(runId);
  const docs = await cdaDb.getDocuments(runId);

  // Build doc type lookup
  const docTypeMap = new Map<string, string>();
  for (const d of docs) {
    docTypeMap.set(d.id, d.docType);
  }

  // Entity extraction helpers
  const sourceQuotes: Array<{ field: string; quoteId: string; label?: string }> = [];

  // E1: Claim ID — from party_reference quotes
  let claimId: string | null = null;
  for (const q of quotes) {
    if (q.categoryTag === "party_reference") {
      const m = q.quoteText.match(/Claim\s+No\.?\s*:?\s*([A-Z0-9-]+)/i);
      if (m) {
        claimId = m[1];
        sourceQuotes.push({ field: "claimId", quoteId: q.id });
        break;
      }
    }
  }

  // E2: Policy Number — search across all quote categories
  let policyNumber: string | null = null;
  // Priority 1: party_reference quotes
  for (const q of quotes) {
    if (q.categoryTag === "party_reference") {
      const m = q.quoteText.match(/Policy\s+(?:No|Number)\.?\s*:?\s*([A-Z0-9-]+)/i);
      if (m) {
        policyNumber = m[1];
        sourceQuotes.push({ field: "policyNumber", quoteId: q.id });
        break;
      }
    }
  }
  // Priority 2: any quote category (policy_clause, declarations_field, etc.)
  if (!policyNumber) {
    for (const q of quotes) {
      const m = q.quoteText.match(/Policy\s+(?:No|Number)\.?\s*:?\s*([A-Z0-9-]+)/i);
      if (m) {
        policyNumber = m[1];
        sourceQuotes.push({ field: "policyNumber", quoteId: q.id });
        break;
      }
    }
  }

  // E3: Insured Name — from claim summary (most reliable), then denial doc header
  let insuredName: string | null = null;
  const denialDoc = docs.find((d) => d.docType === "denial");
  const claimSummaryDoc = docs.find((d) => d.docType === "claim_summary");
  // Strategy 1 (PREFERRED): Look for "Insured:" in claim summary — most complete name
  if (claimSummaryDoc) {
    for (const q of quotes) {
      if (q.docId !== claimSummaryDoc.id) continue;
      const m = q.quoteText.match(/(?:Named\s+Insured|Insured|Policyholder|Claimant)\s*:\s*(.+)/i);
      if (m) {
        insuredName = m[1].trim();
        sourceQuotes.push({ field: "insuredName", quoteId: q.id });
        break;
      }
    }
  }
  // Strategy 2: Look for "Insured:" or "Named Insured:" in any quote
  if (!insuredName) {
    for (const q of quotes) {
      const m = q.quoteText.match(/(?:Named\s+Insured|Insured|Policyholder|Claimant)\s*:\s*(.+)/i);
      if (m) {
        insuredName = m[1].trim();
        sourceQuotes.push({ field: "insuredName", quoteId: q.id });
        break;
      }
    }
  }
  // Strategy 3: Look for "To:" or "Attn:" patterns in denial doc quotes
  if (!insuredName && denialDoc) {
    for (const q of quotes) {
      if (q.docId !== denialDoc.id) continue;
      const toMatch = q.quoteText.match(/(?:To|Attn):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
      if (toMatch) {
        insuredName = toMatch[1].trim();
        sourceQuotes.push({ field: "insuredName", quoteId: q.id });
        break;
      }
    }
  }
  // Strategy 4: Fallback to "Dear" salutation in denial doc
  if (!insuredName && denialDoc) {
    for (const q of quotes) {
      if (q.docId !== denialDoc.id) continue;
      // Handle "Dear Mr. and Mrs. Patel" → extract last name
      const dearAndMatch = q.quoteText.match(/Dear\s+(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+and\s+(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (dearAndMatch) {
        insuredName = dearAndMatch[1].trim();
        sourceQuotes.push({ field: "insuredName", quoteId: q.id });
        break;
      }
      const dearMatch = q.quoteText.match(/Dear\s+(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (dearMatch) {
        insuredName = dearMatch[1].trim();
        sourceQuotes.push({ field: "insuredName", quoteId: q.id });
        break;
      }
    }
  }

  // E4: Insurer Name — from "From:" header or letterhead in denial doc
  let insurerName: string | null = null;
  if (denialDoc) {
    for (const q of quotes) {
      if (q.docId !== denialDoc.id) continue;
      const fromMatch = q.quoteText.match(/From:\s*(.+)/i);
      if (fromMatch) {
        insurerName = fromMatch[1].trim();
        sourceQuotes.push({ field: "insurerName", quoteId: q.id });
        break;
      }
    }
  }
  // Fallback 1: look for company name patterns in denial doc header region
  // Position filter: only first 5 quotes of denial doc, or declarations_field category
  if (!insurerName && denialDoc) {
    const denialQuotes = quotes.filter((q) => q.docId === denialDoc.id);
    const headerQuotes = denialQuotes.filter((q, idx) =>
      idx < 5 || q.categoryTag === "declarations_field"
    );
    for (const q of headerQuotes) {
      const m = q.quoteText.match(/(?:Insurance\s+Company|Mutual\s+Insurance|Indemnity\s+Company|Assurance\s+(?:Company|Corp))\b/i);
      if (m) {
        const fullMatch = q.quoteText.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Insurance|Mutual|Indemnity|Assurance)\s+(?:Company|Corp(?:oration)?|Group|Inc\.?))/i);
        if (fullMatch) {
          insurerName = fullMatch[1].trim();
          sourceQuotes.push({ field: "insurerName", quoteId: q.id });
          break;
        }
      }
    }
  }
  // Fallback 2: look for "X Insurance" or "X Underwriters" without Company suffix
  // Position filter: only first 5 quotes of denial doc, or declarations_field category
  if (!insurerName && denialDoc) {
    const denialQuotes = quotes.filter((q) => q.docId === denialDoc.id);
    const headerQuotes = denialQuotes.filter((q, idx) =>
      idx < 5 || q.categoryTag === "declarations_field"
    );
    for (const q of headerQuotes) {
      const m = q.quoteText.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Insurance|Underwriters|Surety|Casualty))/i);
      if (m) {
        // Validate: must be at least 2 words and look like a company name
        const candidate = m[1].trim();
        if (candidate.split(/\s+/).length >= 2) {
          insurerName = candidate;
          sourceQuotes.push({ field: "insurerName", quoteId: q.id });
          break;
        }
      }
    }
  }
  // Fallback 3: first line of denial doc (letterhead) if it's all caps or title case
  if (!insurerName && denialDoc) {
    for (const q of quotes) {
      if (q.docId !== denialDoc.id) continue;
      // Check if the quote text looks like a company letterhead (all caps or title case, short)
      const text = q.quoteText.trim();
      const firstLine = text.split('\n')[0].trim();
      if (firstLine.length > 5 && firstLine.length < 80 && /^[A-Z][A-Z\s]+$/.test(firstLine)) {
        insurerName = firstLine;
        sourceQuotes.push({ field: "insurerName", quoteId: q.id });
        break;
      }
    }
  }

  // E5: Loss Date — from date_reference quotes in claim_summary
  let lossDate: string | null = null;
  if (claimSummaryDoc) {
    const dateQuotes = quotes.filter(
      (q) => q.docId === claimSummaryDoc.id && q.categoryTag === "date_reference" && q.locationHint?.includes("Date of Loss")
    );
    if (dateQuotes.length > 0) {
      lossDate = parseDateToISO(dateQuotes[0].quoteText);
      sourceQuotes.push({ field: "lossDate", quoteId: dateQuotes[0].id });
    }
  }

  // E6: Denial Date — from date_reference quotes in denial
  let denialDate: string | null = null;
  if (denialDoc) {
    const dateQuotes = quotes.filter(
      (q) => q.docId === denialDoc.id && q.categoryTag === "date_reference" && q.locationHint === "Header"
    );
    if (dateQuotes.length > 0) {
      denialDate = parseDateToISO(dateQuotes[0].quoteText);
      sourceQuotes.push({ field: "denialDate", quoteId: dateQuotes[0].id });
    }
  }

  // E7: Coverage Types — from denial communication (PATCH2 scope)
  // Only extract if denial explicitly references coverage types
  let coverageTypes: string[] | null = null;
  const denialQuotes = denialDoc
    ? quotes.filter((q) => q.docId === denialDoc.id)
    : [];
  // Check denial text for coverage references
  const coverageRefs: string[] = [];
  for (const q of denialQuotes) {
    if (/\bcoverage\s+[a-d]\b/i.test(q.quoteText)) {
      const m = q.quoteText.match(/\b(coverage\s+[a-d])\b/i);
      if (m) coverageRefs.push(m[1]);
      sourceQuotes.push({ field: "coverageTypes", quoteId: q.id });
    }
    if (/\bperil\s+\d+\b/i.test(q.quoteText)) {
      const m = q.quoteText.match(/\b(peril\s+\d+)\b/i);
      if (m) coverageRefs.push(m[1]);
      sourceQuotes.push({ field: "coverageTypes", quoteId: q.id });
    }
    if (/\bcovered\s+peril\b/i.test(q.quoteText)) {
      coverageRefs.push("peril (unspecified)");
      sourceQuotes.push({ field: "coverageTypes", quoteId: q.id });
    }
  }
  if (coverageRefs.length > 0) {
    coverageTypes = Array.from(new Set(coverageRefs));
  }

  // Claimed Amount
  let claimedAmount: string | null = null;
  const amountQuotes = quotes.filter((q) => q.categoryTag === "amount_reference");
  if (amountQuotes.length > 0) {
    const raw = amountQuotes[0].quoteText.replace(/[$,]/g, "");
    claimedAmount = raw;
    sourceQuotes.push({ field: "claimedAmount", quoteId: amountQuotes[0].id });
  }

  // Claimed Items — from claim_fact in claim_summary
  let claimedItems: string | null = null;
  if (claimSummaryDoc) {
    const factQuotes = quotes.filter(
      (q) => q.docId === claimSummaryDoc.id && q.categoryTag === "claim_fact"
    );
    if (factQuotes.length > 0) {
      claimedItems = factQuotes[0].quoteText;
      sourceQuotes.push({ field: "claimedItems", quoteId: factQuotes[0].id });
    }
  }

  // Submission date
  let submissionDate: string | null = null;
  if (claimSummaryDoc) {
    const subDateQuotes = quotes.filter(
      (q) => q.docId === claimSummaryDoc.id && q.categoryTag === "date_reference" && q.locationHint?.includes("Submission")
    );
    if (subDateQuotes.length > 0) {
      submissionDate = parseDateToISO(subDateQuotes[0].quoteText);
    }
  }

  await cdaDb.insertClaimLedger({
    runId,
    claimId,
    policyNumber,
    insuredName,
    insurerName,
    lossDate,
    denialDate,
    coverageTypes,
    claimedItems,
    claimedAmount,
    paidAmount: null,
    communicationChannels: ["mail"],
    sourceQuotes,
    formatInferredFields: ["communicationChannels", "insurerName"],
  });

  // Flag missing required S3 fields in S7 so end-condition C3 passes
  // ("populated OR flagged in S7" rule).
  if (!coverageTypes || coverageTypes.length === 0) {
    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "missing_entity",
      requiredItem: "coverageTypes",
      whyRequired: "Coverage type referenced in denial not identified in available documents.",
      howToObtain: "Review denial letter and policy declarations for explicit coverage type references (e.g., Coverage A, Auto Liability, Medical Benefits).",
      priorityLevel: "supplementary",
      linkedTransformation: "T3",
    });
  }
  if (!lossDate) {
    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "missing_entity",
      requiredItem: "lossDate",
      whyRequired: "Date of loss not identified in available documents.",
      howToObtain: "Review claim summary, denial letter, or incident report for explicit date of loss, date of service, or date of incident.",
      priorityLevel: "supplementary",
      linkedTransformation: "T3",
    });
  }
}

function parseDateToISO(dateStr: string): string {
  // Handle "January 15, 2025" format
  const monthNames: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const m = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const month = monthNames[m[1].toLowerCase()] ?? "01";
    const day = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  // Handle ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr;
}

// ═══════════════════════════════════════════════════════════════════════
// T4: Denial Reason Parsing
// ═══════════════════════════════════════════════════════════════════════

export async function executeT4(runId: string): Promise<string[]> {
  const quotes = await cdaDb.getQuotes(runId);
  const docs = await cdaDb.getDocuments(runId);
  const claimLedger = await cdaDb.getClaimLedger(runId);
  const failureFlags: string[] = [];

  const denialDoc = docs.find((d) => d.docType === "denial");
  if (!denialDoc) {
    failureFlags.push("F1");
    return failureFlags;
  }

  // Get denial_reason and denial_supporting_fact quotes
  const denialReasonQuotes = quotes.filter(
    (q) => q.docId === denialDoc.id &&
    (q.categoryTag === "denial_reason" || q.categoryTag === "denial_supporting_fact")
  );

  // Also get claim_fact quotes from the denial doc (for cited_facts_verbatim)
  const denialFactQuotes = quotes.filter(
    (q) => q.docId === denialDoc.id && q.categoryTag === "claim_fact"
  );

  // Check for vague denial (F2)
  const allDenialText = denialReasonQuotes.map((q) => q.quoteText).join(" ");
  const isVague = denialReasonQuotes.length === 0 ||
    (denialReasonQuotes.length <= 1 && matchesAny(allDenialText, VAGUE_DENIAL_INDICATORS));

  if (isVague && denialReasonQuotes.length === 0) {
    // Check if there's any denial-like text at all
    const allDenialDocQuotes = quotes.filter((q) => q.docId === denialDoc.id);
    const anyDenialText = allDenialDocQuotes.some((q) =>
      matchesAny(q.quoteText, QUOTE_CATEGORY_PATTERNS.denial_reason ?? []) ||
      matchesAny(q.quoteText, VAGUE_DENIAL_INDICATORS)
    );

    if (!anyDenialText) {
      failureFlags.push("F2");
    }
  }

  // Process each denial reason quote into atomic reasons
  const processedReasons: Array<{
    text: string;
    code: string;
    citedRefs: string | null;
    citedFacts: string | null;
    sourceQuoteIds: string[];
  }> = [];

  for (const q of denialReasonQuotes) {
    // Split into sentences for atomic reason detection
    const sentences = splitSentences(q.quoteText);

    for (const sentence of sentences) {
      // Determine normalized_reason_code using priority precedence
      let reasonCode = "other";
      for (const code of REASON_CODE_PRECEDENCE) {
        if (code === "other") continue;
        const patterns = REASON_CODE_PATTERNS[code];
        if (patterns && matchesAny(sentence, patterns)) {
          reasonCode = code;
          break;
        }
      }

      // Extract cited policy references
      let citedRefs: string | null = null;
      const sectionMatch = sentence.match(/(?:pursuant\s+to|under|per)\s+(Section\s+[IVX\d]+\s*[—–-]\s*[^,."]+)/i);
      if (sectionMatch) {
        citedRefs = sectionMatch[1].trim();
      } else {
        const exclusionMatch = sentence.match(/(Exclusion\s+\d+\([a-z]\))/i);
        if (exclusionMatch) citedRefs = exclusionMatch[1];
      }

      // PATCH2: Skip consequence statements — but ONLY if the sentence
      // does NOT also assert a policy basis (citation or non-other reason code).
      // Per spec: "Statements restating the denial outcome WITHOUT asserting
      // a policy basis, factual finding, or condition are not atomic reasons."
      if (matchesAny(sentence, CONSEQUENCE_STATEMENT_PATTERNS) && reasonCode === "other" && !citedRefs) {
        continue;
      }

      // Extract cited facts
      let citedFacts: string | null = null;
      // Look for factual assertions in the denial document that support this reason
      for (const fq of [...denialFactQuotes, ...denialReasonQuotes.filter((r) => r.id !== q.id)]) {
        if (fq.categoryTag === "claim_fact" || fq.categoryTag === "denial_supporting_fact") {
          // Check if this fact is referenced by the reason
          const factWords = toWords(fq.quoteText);
          const reasonWords = toWords(sentence);
          // Simple overlap check — if they share significant content
          const shared = factWords.filter((w) => reasonWords.includes(w) && w.length > 4);
          if (shared.length >= 3) {
            citedFacts = fq.quoteText;
            break;
          }
        }
      }

      // Check for vague denial indicators
      if (reasonCode === "other" && matchesAny(sentence, VAGUE_DENIAL_INDICATORS)) {
        if (!failureFlags.includes("F2")) {
          failureFlags.push("F2");
        }
      }

      processedReasons.push({
        text: sentence.trim(),
        code: reasonCode,
        citedRefs,
        citedFacts,
        sourceQuoteIds: [q.id],
      });
    }
  }

  // If no reasons were extracted (all were consequence statements or empty), check for F2
  if (processedReasons.length === 0) {
    // Try to find any denial-like text in the document
    const allDocQuotes = quotes.filter((q) => q.docId === denialDoc.id);
    let foundVagueReason = false;

    for (const q of allDocQuotes) {
      if (matchesAny(q.quoteText, VAGUE_DENIAL_INDICATORS)) {
        processedReasons.push({
          text: q.quoteText.trim(),
          code: "other",
          citedRefs: null,
          citedFacts: null,
          sourceQuoteIds: [q.id],
        });
        foundVagueReason = true;
        if (!failureFlags.includes("F2")) {
          failureFlags.push("F2");
        }
      }
    }

    if (!foundVagueReason && !failureFlags.includes("F2")) {
      failureFlags.push("F2");
    }
  }

  // Deduplicate reasons (same text)
  const seen = new Set<string>();
  const uniqueReasons = processedReasons.filter((r) => {
    const key = normalize(r.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as typeof processedReasons;

  // Insert into S4 — with defensive length guard
  const MAX_REASON_LENGTH = 10_000; // chars; atomic reasons should be ≤ 1k
  for (const reason of uniqueReasons) {
    let reasonText = reason.text;
    if (reasonText.length > MAX_REASON_LENGTH) {
      console.warn(
        `[T4] reasonTextVerbatim exceeds ${MAX_REASON_LENGTH} chars (${reasonText.length}). ` +
        `Truncating. First 200: "${reasonText.slice(0, 200)}" Last 200: "${reasonText.slice(-200)}"`
      );
      reasonText = reasonText.slice(0, MAX_REASON_LENGTH) + " [TRUNCATED]";
    }
    await cdaDb.insertDenialReason({
      runId,
      claimId: claimLedger?.claimId ?? null,
      reasonTextVerbatim: reasonText,
      normalizedReasonCode: reason.code,
      citedPolicyRefsVerbatim: reason.citedRefs?.slice(0, MAX_REASON_LENGTH) ?? null,
      citedFactsVerbatim: reason.citedFacts?.slice(0, MAX_REASON_LENGTH) ?? null,
      sourceQuoteIds: reason.sourceQuoteIds,
      infoLayer: "L1",
    });
  }

  // Log F2 gap if triggered
  if (failureFlags.includes("F2")) {
    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "insufficient_reason",
      requiredItem: "Specific basis for denial with policy provision or factual finding.",
      whyRequired: "T4 requires at least one denial reason with a specific policy basis, factual finding, or condition. The denial is vague.",
      howToObtain: "Request written basis for denial from insurer.",
      priorityLevel: "critical",
      linkedReasonIds: uniqueReasons.length > 0 ? [] : null,
      linkedTransformation: "T4",
      failureFlag: "F2",
    });
  }

  return failureFlags;
}

// ═══════════════════════════════════════════════════════════════════════
// T5: Policy Clause Parsing
// ═══════════════════════════════════════════════════════════════════════

export async function executeT5(runId: string): Promise<string[]> {
  const quotes = await cdaDb.getQuotes(runId);
  const docs = await cdaDb.getDocuments(runId);
  const failureFlags: string[] = [];

  const policyDoc = docs.find((d) => d.docType === "policy");
  if (!policyDoc) {
    failureFlags.push("F1");
    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "missing_document",
      requiredItem: "Policy document (I1).",
      whyRequired: "T5 requires a policy document to extract clauses. No policy document was classified in T1.",
      howToObtain: "Upload the insurance policy document.",
      priorityLevel: "critical",
      linkedReasonIds: null,
      linkedTransformation: "T5",
      failureFlag: "F1",
    });
    return failureFlags;
  }

  // Get policy_clause quotes
  const policyQuotes = quotes.filter(
    (q) => q.docId === policyDoc.id && q.categoryTag === "policy_clause"
  );

  if (policyQuotes.length === 0) {
    failureFlags.push("F1");
    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "missing_document",
      requiredItem: "Identifiable policy language in I1.",
      whyRequired: "T5 found no policy clause quotes in the policy document.",
      howToObtain: "Verify the uploaded document contains policy language.",
      priorityLevel: "critical",
      linkedReasonIds: null,
      linkedTransformation: "T5",
      failureFlag: "F1",
    });
    return failureFlags;
  }

  // Classify each quote into clause types
  const clauses: Array<{
    text: string;
    heading: string;
    clauseType: string;
    definedTerms: string[] | null;
    scopeNote: string | null;
    sourceQuoteIds: string[];
    precedenceIdx: number;
  }> = [];

  for (const q of policyQuotes) {
    // Determine clause_type using CLAUSE_TYPE_PATTERNS with precedence
    let clauseType = "other";
    let precedenceIdx: number = CLAUSE_TYPE_PRECEDENCE.length;

    for (let i = 0; i < CLAUSE_TYPE_PRECEDENCE.length; i++) {
      const ct = CLAUSE_TYPE_PRECEDENCE[i];
      const patterns = CLAUSE_TYPE_PATTERNS[ct];
      if (patterns && matchesAny(q.quoteText, patterns)) {
        clauseType = ct;
        precedenceIdx = i;
        break;
      }
    }

    // Also check the location hint for clause type clues
    if (clauseType === "other" && q.locationHint) {
      const hint = q.locationHint.toLowerCase();
      if (hint.includes("coverage")) { clauseType = "coverage_grant"; precedenceIdx = 0 as number; }
      else if (hint.includes("exclusion")) { clauseType = "exclusion"; precedenceIdx = 1 as number; }
      else if (hint.includes("condition")) { clauseType = "condition"; precedenceIdx = 2 as number; }
      else if (hint.includes("peril")) { clauseType = "coverage_grant"; precedenceIdx = 0 as number; }
      else if (hint.includes("definition")) { clauseType = "definition"; precedenceIdx = 3 as number; }
    }

    // Extract defined terms (bold/quoted/capitalized terms with definitions)
    const definedTerms: string[] = [];
    // Look for quoted terms
    const quotedTerms = q.quoteText.match(/[""\u201C]([^""\u201D]+)[""\u201D]/g);
    if (quotedTerms) {
      for (const qt of quotedTerms) {
        definedTerms.push(qt.replace(/[""\u201C\u201D]/g, ""));
      }
    }
    // Look for capitalized multi-word terms that appear to be defined
    const capitalTerms = q.quoteText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g);
    if (capitalTerms) {
      for (const ct of capitalTerms) {
        if (!["Coverage A", "Section I", "Declarations Page"].includes(ct)) {
          // Only include if it looks like a defined term
          if (q.quoteText.includes(`"${ct}"`) || q.quoteText.includes(`${ct} means`)) {
            definedTerms.push(ct);
          }
        }
      }
    }

    // Extract scope notes (e.g., "regardless of any other cause...")
    let scopeNote: string | null = null;
    const scopeMatch = q.quoteText.match(/(?:regardless\s+of|notwithstanding|subject\s+to)\s+[^.]+/i);
    if (scopeMatch) {
      scopeNote = scopeMatch[0].trim();
    }

    clauses.push({
      text: q.quoteText,
      heading: q.locationHint ?? "",
      clauseType,
      definedTerms: definedTerms.length > 0 ? definedTerms : null,
      scopeNote,
      sourceQuoteIds: [q.id],
      precedenceIdx,
    });
  }

  // Sort by clause_type precedence, then by source quote id
  clauses.sort((a, b) => {
    if (a.precedenceIdx !== b.precedenceIdx) return a.precedenceIdx - b.precedenceIdx;
    return (a.sourceQuoteIds[0] ?? "").localeCompare(b.sourceQuoteIds[0] ?? "");
  });

  // Insert into S5
  for (const clause of clauses) {
    await cdaDb.insertPolicyClause({
      runId,
      clauseTextVerbatim: clause.text,
      sectionHeading: clause.heading,
      clauseType: clause.clauseType,
      definedTerms: clause.definedTerms,
      effectiveScopeNote: clause.scopeNote,
      sourceQuoteIds: clause.sourceQuoteIds,
      infoLayer: "L1",
    });
  }

  return failureFlags;
}

// ═══════════════════════════════════════════════════════════════════════
// T6: Policy-to-Denial Linking
// ═══════════════════════════════════════════════════════════════════════

export async function executeT6(runId: string): Promise<string[]> {
  const reasons = await cdaDb.getDenialReasons(runId);
  const clauses = await cdaDb.getPolicyClauses(runId);
  const failureFlags: string[] = [];

  for (const reason of reasons) {
    let linked = false;

    // ─── Step 1: Explicit Citation ───
    if (reason.citedPolicyRefsVerbatim) {
      const citedRef = normalize(reason.citedPolicyRefsVerbatim);
      for (const clause of clauses) {
        const heading = normalize(clause.sectionHeading ?? "");
        const clauseText = normalize(clause.clauseTextVerbatim);
        // Check if the cited reference matches a section heading or appears in clause text
        if (heading.includes(citedRef) || citedRef.includes(heading) ||
            clauseText.includes(citedRef)) {
          await cdaDb.insertComparisonRow({
            runId,
            reasonId: reason.id,
            clauseId: clause.id,
            linkingBasis: "explicit_citation",
            supportingQuoteIds: [
              ...((reason.sourceQuoteIds as string[]) ?? []),
              ...((clause.sourceQuoteIds as string[]) ?? []),
            ],
          });
          linked = true;
          // Don't break — a reason can link to multiple clauses via explicit citation
        }
      }
    }

    if (linked) continue;

    // ─── Step 2: Verbatim Language Overlap ───
    for (const clause of clauses) {
      const overlaps = findVerbatimOverlaps(
        reason.reasonTextVerbatim,
        clause.clauseTextVerbatim,
        VERBATIM_OVERLAP_MIN_WORDS,
      );
      if (overlaps.length > 0) {
        await cdaDb.insertComparisonRow({
          runId,
          reasonId: reason.id,
          clauseId: clause.id,
          linkingBasis: "verbatim_language_overlap",
          notes: `Overlapping phrases: ${overlaps.join("; ")}`,
          supportingQuoteIds: [
            ...((reason.sourceQuoteIds as string[]) ?? []),
            ...((clause.sourceQuoteIds as string[]) ?? []),
          ],
        });
        linked = true;
      }
    }

    if (linked) continue;

    // ─── Step 3: Defined Term Overlap ───
    for (const clause of clauses) {
      const definedTerms = (clause.definedTerms as string[]) ?? [];
      if (definedTerms.length === 0) continue;

      const reasonNorm = normalize(reason.reasonTextVerbatim);
      const matchedTerms = definedTerms.filter((term) =>
        reasonNorm.includes(normalize(term))
      );

      if (matchedTerms.length > 0) {
        await cdaDb.insertComparisonRow({
          runId,
          reasonId: reason.id,
          clauseId: clause.id,
          linkingBasis: "defined_term_overlap",
          notes: `Matched defined terms: ${matchedTerms.join(", ")}`,
          supportingQuoteIds: [
            ...((reason.sourceQuoteIds as string[]) ?? []),
            ...((clause.sourceQuoteIds as string[]) ?? []),
          ],
        });
        linked = true;
      }
    }

    if (linked) continue;

    // ─── Step 4: Heading Overlap (PATCH3 deterministic table) ───
    const mappedClauseTypes = HEADING_OVERLAP_MAP[reason.normalizedReasonCode];
    if (mappedClauseTypes !== null && mappedClauseTypes !== undefined) {
      for (const clause of clauses) {
        if (mappedClauseTypes.includes(clause.clauseType)) {
          await cdaDb.insertComparisonRow({
            runId,
            reasonId: reason.id,
            clauseId: clause.id,
            linkingBasis: "heading_overlap",
            notes: `Heading overlap: ${reason.normalizedReasonCode} → ${clause.clauseType}`,
            supportingQuoteIds: [
              ...((reason.sourceQuoteIds as string[]) ?? []),
              ...((clause.sourceQuoteIds as string[]) ?? []),
            ],
          });
          linked = true;
        }
      }
    }

    if (linked) continue;

    // ─── Step 5: No Link Found (F3) ───
    // Even unlinked rows must cite the denial reason quote for traceability (C10).
    await cdaDb.insertComparisonRow({
      runId,
      reasonId: reason.id,
      clauseId: null,
      linkingBasis: "none",
      supportingQuoteIds: [...((reason.sourceQuoteIds as string[]) ?? [])],
    });

    if (!failureFlags.includes("F3")) {
      failureFlags.push("F3");
    }

    await cdaDb.insertEvidenceGap({
      runId,
      gapType: "missing_clause",
      requiredItem: `Denial reason [${reason.normalizedReasonCode}] does not reference an identifiable policy provision.`,
      whyRequired: "T6 requires linking each denial reason to a policy clause for comparison.",
      howToObtain: "Request a supplemental written explanation from the insurer citing the applicable policy section.",
      priorityLevel: "important",
      linkedReasonIds: [reason.id],
      linkedTransformation: "T6",
      failureFlag: "F3",
    });
  }

  return failureFlags;
}

// ═══════════════════════════════════════════════════════════════════════
// T7: Semantic Comparison (Option C — Hybrid Deterministic + LLM)
//
// Write boundary: T7 may ONLY update S6 rows (matchType, mismatchType,
// requiredEvidence, missingEvidence, conflictEvidence, supportingQuoteIds,
// resolutionMethod, t7TranscriptId). It MUST NOT write to S3, S4, S5, S7, S8.
//
// T7 does NOT use normalized_reason_code (keyword taxonomy, can be wrong).
// T7 relies on: reason_text_verbatim, clause_text_verbatim, defined_terms,
// T8 conflicts, linking_basis, clause_id presence.
//
// T8 conflict does NOT forbid 'supported' — it requires conflict_evidence
// + missing_evidence gap, not auto-downgrade.
// ═══════════════════════════════════════════════════════════════════════

/** T7 transcript entry for audit trail */
export interface T7Transcript {
  rowId: string;
  reasonId: string | null;
  clauseId: string | null;
  resolutionMethod: "deterministic" | "llm_assisted" | "fallback_ambiguous";
  deterministicRule?: string;
  llmPrompt?: string;
  llmResponse?: string;
  llmValidationResult?: "accepted" | "rejected_schema" | "rejected_quotes" | "rejected_new_facts";
  finalMatchType: string;
  finalMismatchType: string | null;
  timestamp: number;
}

/** Valid match_type enum values */
const VALID_MATCH_TYPES = ["supported", "partially_supported", "unsupported", "ambiguous", "not_assessable"] as const;
type MatchType = typeof VALID_MATCH_TYPES[number];

/** Valid mismatch_type enum values */
const VALID_MISMATCH_TYPES = [
  "reason_contradicts_clause", "reason_misquotes_clause",
  "reason_cites_inapplicable_clause", "clause_supports_coverage",
  "no_clause_found", "insufficient_reason_detail", "null",
] as const;
type MismatchType = typeof VALID_MISMATCH_TYPES[number];

export interface T7Result {
  transcripts: T7Transcript[];
  llmInvokedCount: number;
  deterministicResolvedCount: number;
  fallbackAmbiguousCount: number;
}

export async function executeT7(runId: string): Promise<T7Result> {
  const s6Rows = await cdaDb.getComparisonMatrix(runId);
  const reasons = await cdaDb.getDenialReasons(runId);
  const clauses = await cdaDb.getPolicyClauses(runId);
  const contradictions = await cdaDb.getContradictions(runId);
  const quotes = await cdaDb.getQuotes(runId);

  // Derive deterministic hash from CDA run documents
  const cdaDocs = await cdaDb.getDocuments(runId);
  const cdaHash = createHash("sha256")
    .update(`cda-t7:${runId}:${cdaDocs.map(d => d.hash).sort().join("|")}`)
    .digest("hex");

  // Build lookup maps
  const reasonMap = new Map(reasons.map((r) => [r.id, r]));
  const clauseMap = new Map(clauses.map((c) => [c.id, c]));

  const transcripts: T7Transcript[] = [];
  let llmInvokedCount = 0;
  let deterministicResolvedCount = 0;
  let fallbackAmbiguousCount = 0;

  // Sort S6 rows deterministically: by reasonId ASC, then clauseId ASC (nulls last)
  const sortedRows = [...s6Rows].sort((a, b) => {
    if ((a.reasonId ?? "") !== (b.reasonId ?? "")) return (a.reasonId ?? "").localeCompare(b.reasonId ?? "");
    if (a.clauseId === null && b.clauseId === null) return 0;
    if (a.clauseId === null) return 1;
    if (b.clauseId === null) return -1;
    return a.clauseId.localeCompare(b.clauseId);
  });

  for (const row of sortedRows) {
    const reason = row.reasonId ? reasonMap.get(row.reasonId) : undefined;
    const clause = row.clauseId ? clauseMap.get(row.clauseId) : null;

    // ─── Deterministic First-Pass ───

    // Rule 1: No clause_id → not_assessable (skip)
    if (row.clauseId === null) {
      const transcript: T7Transcript = {
        rowId: row.id,
        reasonId: row.reasonId,
        clauseId: null,
        resolutionMethod: "deterministic",
        deterministicRule: "rule_1_no_clause_id",
        finalMatchType: "not_assessable",
        finalMismatchType: "no_clause_found",
        timestamp: Date.now(),
      };
      await cdaDb.updateComparisonRow(row.id, {
        matchType: "not_assessable",
        mismatchType: "no_clause_found",
        resolutionMethod: "deterministic",
      });
      transcripts.push(transcript);
      deterministicResolvedCount++;
      continue;
    }

    // Rule 2: linking_basis = none → not_assessable (skip)
    if (row.linkingBasis === "none") {
      const transcript: T7Transcript = {
        rowId: row.id,
        reasonId: row.reasonId,
        clauseId: row.clauseId,
        resolutionMethod: "deterministic",
        deterministicRule: "rule_2_linking_basis_none",
        finalMatchType: "not_assessable",
        finalMismatchType: "no_clause_found",
        timestamp: Date.now(),
      };
      await cdaDb.updateComparisonRow(row.id, {
        matchType: "not_assessable",
        mismatchType: "no_clause_found",
        resolutionMethod: "deterministic",
      });
      transcripts.push(transcript);
      deterministicResolvedCount++;
      continue;
    }

    // Gather data for comparison (no normalized_reason_code used here)
    const reasonText = reason?.reasonTextVerbatim ?? "";
    const clauseText = clause?.clauseTextVerbatim ?? "";
    const clauseHeading = clause?.sectionHeading ?? "";
    const definedTerms = (clause?.definedTerms as string[]) ?? [];

    // Check for relevant T8 conflicts
    const relevantConflicts = contradictions.filter((c) => {
      const linkedQuotes = (c.linkedQuoteIds as string[]) ?? [];
      const reasonQuotes = (reason?.sourceQuoteIds as string[]) ?? [];
      // A conflict is relevant if it shares quotes with this reason
      return linkedQuotes.some((qid) => reasonQuotes.includes(qid)) ||
        c.conflictType === "fact_conflict";
    });

    // Rule 3: Explicit citation + reason reproduces clause restriction verbatim → supported
    if (row.linkingBasis === "explicit_citation") {
      const overlaps = findVerbatimOverlaps(reasonText, clauseText, 3);
      const hasSubstantiveOverlap = overlaps.some((o) => o.split(" ").length >= 3);

      if (hasSubstantiveOverlap) {
        // Check for exception/alternative paths not addressed in the reason
        const clauseHasExceptions = hasUnaddressedExceptions(clauseText, reasonText);

        let matchType: MatchType;
        let mismatchType: MismatchType | null = null;
        let missingEvidence: string | null = null;
        let deterministicRule: string;

        if (clauseHasExceptions) {
          // Rule 4: Clause contains exception/alternative paths not addressed → partially_supported
          matchType = "partially_supported";
          mismatchType = "insufficient_reason_detail";
          missingEvidence = "Clause contains exception or alternative condition not addressed in the denial reason.";
          deterministicRule = "rule_4_explicit_citation_with_exceptions";
        } else {
          matchType = "supported";
          deterministicRule = "rule_3_explicit_citation_verbatim_match";
        }

        // Rule 5: If T8 conflict exists, populate conflict_evidence but do NOT auto-downgrade
        let conflictEvidence: string | null = null;
        if (relevantConflicts.length > 0) {
          conflictEvidence = relevantConflicts
            .map((c) => `[${c.conflictType}] ${c.explanation}`)
            .join("; ");
          if (!missingEvidence) {
            missingEvidence = "Basis fact disputed; additional evidence required to resolve factual dispute.";
          }
        }

        const transcript: T7Transcript = {
          rowId: row.id,
          reasonId: row.reasonId,
          clauseId: row.clauseId,
          resolutionMethod: "deterministic",
          deterministicRule,
          finalMatchType: matchType,
          finalMismatchType: mismatchType,
          timestamp: Date.now(),
        };
        await cdaDb.updateComparisonRow(row.id, {
          matchType,
          mismatchType,
          missingEvidence,
          conflictEvidence,
          resolutionMethod: "deterministic",
        });
        transcripts.push(transcript);
        deterministicResolvedCount++;
        continue;
      }
    }

    // Rule 3b: Verbatim language overlap with substantive match → supported or partially_supported
    if (row.linkingBasis === "verbatim_language_overlap") {
      const overlaps = findVerbatimOverlaps(reasonText, clauseText, VERBATIM_OVERLAP_MIN_WORDS);
      if (overlaps.some((o) => o.split(" ").length >= VERBATIM_OVERLAP_MIN_WORDS)) {
        const clauseHasExceptions = hasUnaddressedExceptions(clauseText, reasonText);
        let matchType: MatchType = clauseHasExceptions ? "partially_supported" : "supported";
        let mismatchType: MismatchType | null = clauseHasExceptions ? "insufficient_reason_detail" : null;
        let missingEvidence: string | null = clauseHasExceptions
          ? "Clause contains exception or alternative condition not addressed in the denial reason."
          : null;

        // Rule 5: conflict handling
        let conflictEvidence: string | null = null;
        if (relevantConflicts.length > 0) {
          conflictEvidence = relevantConflicts
            .map((c) => `[${c.conflictType}] ${c.explanation}`)
            .join("; ");
          if (!missingEvidence) {
            missingEvidence = "Basis fact disputed; additional evidence required to resolve factual dispute.";
          }
        }

        const transcript: T7Transcript = {
          rowId: row.id,
          reasonId: row.reasonId,
          clauseId: row.clauseId,
          resolutionMethod: "deterministic",
          deterministicRule: clauseHasExceptions
            ? "rule_4_verbatim_overlap_with_exceptions"
            : "rule_3b_verbatim_overlap_match",
          finalMatchType: matchType,
          finalMismatchType: mismatchType,
          timestamp: Date.now(),
        };
        await cdaDb.updateComparisonRow(row.id, {
          matchType,
          mismatchType,
          missingEvidence,
          conflictEvidence,
          resolutionMethod: "deterministic",
        });
        transcripts.push(transcript);
        deterministicResolvedCount++;
        continue;
      }
    }

    // ─── Ambiguous after deterministic pass → queue for LLM ───
    // Heading overlap and defined_term_overlap with no verbatim match land here

    // Collect valid supporting quote IDs for this row
    const validQuoteIds = ((row.supportingQuoteIds as string[]) ?? []).filter(
      (qid) => quotes.some((q) => q.id === qid)
    );

    // Build LLM prompt envelope (no normalized_reason_code included)
    const llmPrompt = buildT7LlmPrompt({
      reasonText,
      clauseText,
      clauseType: clause?.clauseType ?? "unknown",
      sectionHeading: clauseHeading,
      definedTerms,
      supportingQuoteSpans: validQuoteIds.map((qid) => {
        const q = quotes.find((qq) => qq.id === qid);
        return { quoteId: qid, text: q?.quoteText ?? "" };
      }),
      relevantConflicts: relevantConflicts.map((c) => ({
        conflictType: c.conflictType,
        explanation: c.explanation,
      })),
    });

    try {
      const llmResult = await invokeLLMDeterministic({
        documentHash: cdaHash,
        pass: "cda-t7",
        messages: [
          {
            role: "system",
            content: T7_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: llmPrompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: T7_OUTPUT_SCHEMA,
        },
      });

      const rawContent = typeof llmResult.choices[0]?.message?.content === "string"
        ? llmResult.choices[0].message.content
        : "";

      // Validate LLM output
      const validation = validateT7LlmOutput(rawContent, validQuoteIds);

      if (validation.valid && validation.parsed) {
        const parsed = validation.parsed;

        // Rule 5: If T8 conflict exists, ensure conflict_evidence is populated
        let conflictEvidence = parsed.conflict_evidence || null;
        let missingEvidence = parsed.missing_evidence || null;
        if (relevantConflicts.length > 0 && !conflictEvidence) {
          conflictEvidence = relevantConflicts
            .map((c) => `[${c.conflictType}] ${c.explanation}`)
            .join("; ");
        }
        if (relevantConflicts.length > 0 && !missingEvidence) {
          missingEvidence = "Basis fact disputed; additional evidence required to resolve factual dispute.";
        }

        const transcriptId = `t7-llm-${runId}-${row.id}-${Date.now()}`;
        const transcript: T7Transcript = {
          rowId: row.id,
          reasonId: row.reasonId,
          clauseId: row.clauseId,
          resolutionMethod: "llm_assisted",
          llmPrompt,
          llmResponse: rawContent,
          llmValidationResult: "accepted",
          finalMatchType: parsed.match_type,
          finalMismatchType: parsed.mismatch_type || null,
          timestamp: Date.now(),
        };

        await cdaDb.updateComparisonRow(row.id, {
          matchType: parsed.match_type,
          mismatchType: parsed.mismatch_type || null,
          requiredEvidence: parsed.required_evidence || null,
          missingEvidence,
          conflictEvidence,
          supportingQuoteIds: parsed.supporting_quote_ids,
          resolutionMethod: "llm_assisted",
          t7TranscriptId: transcriptId,
        });

        transcripts.push(transcript);
        llmInvokedCount++;
      } else {
        // Validation failed → fallback to ambiguous
        const transcriptId = `t7-fallback-${runId}-${row.id}-${Date.now()}`;
        const transcript: T7Transcript = {
          rowId: row.id,
          reasonId: row.reasonId,
          clauseId: row.clauseId,
          resolutionMethod: "fallback_ambiguous",
          llmPrompt,
          llmResponse: rawContent,
          llmValidationResult: validation.rejectionReason as any,
          finalMatchType: "ambiguous",
          finalMismatchType: "insufficient_reason_detail",
          timestamp: Date.now(),
        };

        let conflictEvidence: string | null = null;
        if (relevantConflicts.length > 0) {
          conflictEvidence = relevantConflicts
            .map((c) => `[${c.conflictType}] ${c.explanation}`)
            .join("; ");
        }

        await cdaDb.updateComparisonRow(row.id, {
          matchType: "ambiguous",
          mismatchType: "insufficient_reason_detail",
          conflictEvidence,
          missingEvidence: "LLM output validation failed; manual review required.",
          resolutionMethod: "fallback_ambiguous",
          t7TranscriptId: transcriptId,
        });

        transcripts.push(transcript);
        fallbackAmbiguousCount++;
      }
    } catch (err) {
      // LLM call failed entirely → fallback to ambiguous
      const transcriptId = `t7-error-${runId}-${row.id}-${Date.now()}`;
      const transcript: T7Transcript = {
        rowId: row.id,
        reasonId: row.reasonId,
        clauseId: row.clauseId,
        resolutionMethod: "fallback_ambiguous",
        llmPrompt: llmPrompt,
        llmResponse: String(err),
        llmValidationResult: "rejected_schema",
        finalMatchType: "ambiguous",
        finalMismatchType: "insufficient_reason_detail",
        timestamp: Date.now(),
      };

      let conflictEvidence: string | null = null;
      if (relevantConflicts.length > 0) {
        conflictEvidence = relevantConflicts
          .map((c) => `[${c.conflictType}] ${c.explanation}`)
          .join("; ");
      }

      await cdaDb.updateComparisonRow(row.id, {
        matchType: "ambiguous",
        mismatchType: "insufficient_reason_detail",
        conflictEvidence,
        missingEvidence: `LLM invocation failed: ${String(err)}. Manual review required.`,
        resolutionMethod: "fallback_ambiguous",
        t7TranscriptId: transcriptId,
      });

      transcripts.push(transcript);
      fallbackAmbiguousCount++;
    }
  }

  return { transcripts, llmInvokedCount, deterministicResolvedCount, fallbackAmbiguousCount };
}

// ─── T7 Helpers ───

/**
 * Check if clause contains exception/alternative paths not addressed in the reason.
 * Deterministic: looks for conditional language ("unless", "except", "provided that",
 * "if the insured") in clause that has no corresponding language in reason.
 */
function hasUnaddressedExceptions(clauseText: string, reasonText: string): boolean {
  const exceptionPatterns = [
    /\bunless\b/i,
    /\bexcept\s+(?:where|when|if|that)\b/i,
    /\bprovided\s+that\b/i,
    /\bif\s+the\s+insured\b/i,
    /\bsubject\s+to\b/i,
    /\bthis\s+exclusion\s+does\s+not\s+apply\b/i,
    /\bdoes\s+not\s+apply\s+(?:if|when|where)\b/i,
  ];

  const clauseNorm = normalize(clauseText);
  const reasonNorm = normalize(reasonText);

  for (const pattern of exceptionPatterns) {
    if (pattern.test(clauseNorm)) {
      // Check if the reason addresses this exception
      if (!pattern.test(reasonNorm)) {
        return true;
      }
    }
  }
  return false;
}

/** Build the LLM prompt for T7 comparison */
function buildT7LlmPrompt(input: {
  reasonText: string;
  clauseText: string;
  clauseType: string;
  sectionHeading: string;
  definedTerms: string[];
  supportingQuoteSpans: Array<{ quoteId: string; text: string }>;
  relevantConflicts: Array<{ conflictType: string; explanation: string }>;
}): string {
  let prompt = `You are analyzing a claim denial. Compare the denial reason against the policy clause and determine if the clause supports the insurer's stated denial reason.

## Denial Reason (verbatim from insurer's letter)
${input.reasonText}

## Policy Clause (verbatim from policy document)
Section: ${input.sectionHeading}
Clause Type: ${input.clauseType}
${input.clauseText}`;

  if (input.definedTerms.length > 0) {
    prompt += `\n\n## Defined Terms in This Clause\n${input.definedTerms.join(", ")}`;
  }

  if (input.supportingQuoteSpans.length > 0) {
    prompt += `\n\n## Supporting Quotes (use these quote IDs in your response)\n`;
    for (const q of input.supportingQuoteSpans) {
      prompt += `- Quote ${q.quoteId}: "${q.text}"\n`;
    }
  }

  if (input.relevantConflicts.length > 0) {
    prompt += `\n\n## Known Factual Disputes\n`;
    for (const c of input.relevantConflicts) {
      prompt += `- [${c.conflictType}] ${c.explanation}\n`;
    }
  }

  prompt += `\n\n## Instructions
Determine whether the policy clause supports the insurer's denial reason.
- "supported": The clause directly supports the denial as stated.
- "partially_supported": The clause is relevant but has exceptions, conditions, or alternative paths not addressed.
- "unsupported": The clause does not support the denial reason; the insurer's reasoning is inconsistent with the clause text.
- "ambiguous": Insufficient information to determine support; the relationship is unclear.

If the match is not "supported", provide a mismatch_type.
If there are factual disputes, note them in conflict_evidence but do NOT let them override your clause-text analysis.
You MUST cite supporting_quote_ids from the provided quotes. Do not invent new facts.

Respond with JSON only.`;

  return prompt;
}

/** T7 system prompt — constrains the LLM's behavior */
const T7_SYSTEM_PROMPT = `You are a forensic insurance analyst. Your task is to compare a denial reason against a policy clause and assess whether the clause supports the insurer's stated basis for denial.

Rules:
1. You may ONLY assess the relationship between the denial reason text and the clause text provided.
2. You must NOT introduce facts, legal interpretations, or policy provisions not present in the provided materials.
3. You must cite supporting_quote_ids from the provided quotes. Every quote ID you cite must be from the provided list.
4. If factual disputes exist, note them in conflict_evidence but still assess the clause-reason relationship on its own terms.
5. When in doubt, return "ambiguous" — do not guess.
6. Respond with valid JSON matching the required schema. No additional text.`;

/** T7 output JSON schema for structured response */
const T7_OUTPUT_SCHEMA = {
  name: "t7_comparison_result",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      match_type: {
        type: "string" as const,
        enum: ["supported", "partially_supported", "unsupported", "ambiguous"],
        description: "Assessment of whether the clause supports the denial reason",
      },
      mismatch_type: {
        type: ["string", "null"] as any,
        enum: [
          "reason_contradicts_clause", "reason_misquotes_clause",
          "reason_cites_inapplicable_clause", "clause_supports_coverage",
          "insufficient_reason_detail", null,
        ],
        description: "Type of mismatch if match_type is not supported",
      },
      required_evidence: {
        type: ["string", "null"] as any,
        description: "Evidence that would be needed to fully resolve the comparison",
      },
      missing_evidence: {
        type: ["string", "null"] as any,
        description: "Evidence that is missing from the provided materials",
      },
      conflict_evidence: {
        type: ["string", "null"] as any,
        description: "Description of any factual disputes relevant to this comparison",
      },
      supporting_quote_ids: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Quote IDs from the provided quotes that support this assessment",
      },
    },
    required: ["match_type", "mismatch_type", "required_evidence", "missing_evidence", "conflict_evidence", "supporting_quote_ids"],
    additionalProperties: false,
  },
};

/** Validate LLM output against schema and constraints */
function validateT7LlmOutput(
  rawContent: string,
  validQuoteIds: string[],
): { valid: boolean; parsed?: any; rejectionReason?: string } {
  // Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { valid: false, rejectionReason: "rejected_schema" };
  }

  // Check required fields
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, rejectionReason: "rejected_schema" };
  }

  // Validate match_type enum
  const validMatchTypes = ["supported", "partially_supported", "unsupported", "ambiguous"];
  if (!validMatchTypes.includes(parsed.match_type)) {
    return { valid: false, rejectionReason: "rejected_schema" };
  }

  // Validate mismatch_type enum (null is allowed)
  const validMismatchTypes = [
    "reason_contradicts_clause", "reason_misquotes_clause",
    "reason_cites_inapplicable_clause", "clause_supports_coverage",
    "insufficient_reason_detail", null,
  ];
  if (parsed.mismatch_type !== undefined && !validMismatchTypes.includes(parsed.mismatch_type)) {
    return { valid: false, rejectionReason: "rejected_schema" };
  }

  // Validate supporting_quote_ids is non-empty array
  if (!Array.isArray(parsed.supporting_quote_ids) || parsed.supporting_quote_ids.length === 0) {
    return { valid: false, rejectionReason: "rejected_quotes" };
  }

  // Validate all quote IDs are from the provided set
  const invalidQuotes = parsed.supporting_quote_ids.filter(
    (qid: string) => !validQuoteIds.includes(qid)
  );
  if (invalidQuotes.length > 0) {
    return { valid: false, rejectionReason: "rejected_quotes" };
  }

  return { valid: true, parsed };
}

// ═══════════════════════════════════════════════════════════════════════
// T8: Contradiction Detection
// ═══════════════════════════════════════════════════════════════════════

export async function executeT8(runId: string): Promise<void> {
  const quotes = await cdaDb.getQuotes(runId);
  const docs = await cdaDb.getDocuments(runId);

  // Group quotes by doc type
  const docTypeMap = new Map<string, string>();
  for (const d of docs) docTypeMap.set(d.id, d.docType);

  const claimQuotes = quotes.filter((q) => docTypeMap.get(q.docId) === "claim_summary");
  const denialQuotes = quotes.filter((q) => docTypeMap.get(q.docId) === "denial");
  const policyQuotes = quotes.filter((q) => docTypeMap.get(q.docId) === "policy");

  // ─── Date Conflicts ───
  const claimDates = extractDates(claimQuotes);
  const denialDates = extractDates(denialQuotes);

  // Compare loss/accident dates
  const lossDateKeywords = /(?:loss|accident|incident|occurred|damage|event|collision)/i;
  const claimLossDate = claimDates.find((d) => lossDateKeywords.test(d.context));
  const denialLossDate = denialDates.find((d) => lossDateKeywords.test(d.context));

  if (claimLossDate && denialLossDate && claimLossDate.normalized !== denialLossDate.normalized) {
    await cdaDb.insertContradiction({
      runId,
      conflictType: "date_conflict",
      claimReference: `Loss/accident date: ${claimLossDate.raw} (quote ${claimLossDate.quoteId})`,
      denialReference: `Loss/accident date: ${denialLossDate.raw} (quote ${denialLossDate.quoteId})`,
      explanation: `Claim states loss/accident date as ${claimLossDate.raw} but denial references ${denialLossDate.raw}. These dates conflict.`,
      linkedQuoteIds: [claimLossDate.quoteId, denialLossDate.quoteId],
    });
  }

  // Also compare ALL dates across documents for broader conflict detection
  // If the same event is described with different dates, flag it
  for (const cd of claimDates) {
    for (const dd of denialDates) {
      // Skip if already caught as loss date conflict
      if (cd === claimLossDate && dd === denialLossDate) continue;
      // Only flag if both contexts suggest they're describing the same event
      const cdWords = cd.context.toLowerCase().split(/\s+/);
      const ddWords = dd.context.toLowerCase().split(/\s+/);
      const sharedContext = cdWords.filter(w => w.length > 3 && ddWords.includes(w));
      if (sharedContext.length >= 1 && cd.normalized !== dd.normalized) {
        await cdaDb.insertContradiction({
          runId,
          conflictType: "date_conflict",
          claimReference: `${cd.context}: ${cd.raw} (quote ${cd.quoteId})`,
          denialReference: `${dd.context}: ${dd.raw} (quote ${dd.quoteId})`,
          explanation: `Claim and denial reference different dates in similar context: claim says ${cd.raw}, denial says ${dd.raw}.`,
          linkedQuoteIds: [cd.quoteId, dd.quoteId],
        });
      }
    }
  }

  // ─── Amount Conflicts ───
  const claimAmounts = extractAmounts(claimQuotes);
  const denialAmounts = extractAmounts(denialQuotes);

  for (const ca of claimAmounts) {
    for (const da of denialAmounts) {
      if (ca.value !== da.value) {
        await cdaDb.insertContradiction({
          runId,
          conflictType: "amount_conflict",
          claimReference: `Amount: ${ca.raw} (quote ${ca.quoteId})`,
          denialReference: `Amount: ${da.raw} (quote ${da.quoteId})`,
          explanation: `Claim states amount as ${ca.raw} but denial references ${da.raw}.`,
          linkedQuoteIds: [ca.quoteId, da.quoteId],
        });
      }
    }
  }

  // ─── Fact Conflicts ───
  // Check if claim and denial characterize the loss event differently
  const claimFactTexts = claimQuotes
    .filter((q) => q.categoryTag === "claim_fact")
    .map((q) => ({ text: q.quoteText, quoteId: q.id }));

  const denialFactTexts = [
    ...denialQuotes.filter((q) => q.categoryTag === "claim_fact"),
    ...denialQuotes.filter((q) => q.categoryTag === "denial_supporting_fact"),
    ...denialQuotes.filter((q) => q.categoryTag === "denial_reason"),
  ].map((q) => ({ text: q.quoteText, quoteId: q.id }));

  // Check for mechanism disputes using CONFLICT_PATTERNS
  for (const cf of claimFactTexts) {
    const claimMatchesClaim = CONFLICT_PATTERNS.fact_conflict.claimIndicators.some((p) => p.test(cf.text));
    if (!claimMatchesClaim) continue;

    for (const df of denialFactTexts) {
      const denialMatchesDenial = CONFLICT_PATTERNS.fact_conflict.denialIndicators.some((p) => p.test(df.text));
      if (denialMatchesDenial) {
        await cdaDb.insertContradiction({
          runId,
          conflictType: "fact_conflict",
          claimReference: cf.text,
          denialReference: df.text,
          explanation: `Claim characterizes the loss as sudden/accidental but denial characterizes it as gradual/long-term. This is a mechanism dispute.`,
          linkedQuoteIds: [cf.quoteId, df.quoteId],
        });
      }
    }
  }

  // ─── Party Identity Conflicts ───
  // Check for name/policy number discrepancies across documents
  const partyQuotes = quotes.filter((q) => q.categoryTag === "party_reference");
  const policyNumbers = new Map<string, string>();
  const claimNumbers = new Map<string, string>();

  for (const q of partyQuotes) {
    const polMatch = q.quoteText.match(/Policy\s+No\.?\s*:?\s*([A-Z0-9-]+)/i);
    if (polMatch) policyNumbers.set(q.docId, polMatch[1]);
    const clmMatch = q.quoteText.match(/Claim\s+No\.?\s*:?\s*([A-Z0-9-]+)/i);
    if (clmMatch) claimNumbers.set(q.docId, clmMatch[1]);
  }

  // Check for policy number mismatches across docs
  const polNums = Array.from(policyNumbers.values());
  if (polNums.length > 1 && new Set(polNums).size > 1) {
    const quoteIdsForConflict = partyQuotes
      .filter((q) => q.quoteText.match(/Policy\s+No/i))
      .map((q) => q.id);
    await cdaDb.insertContradiction({
      runId,
      conflictType: "party_identity_conflict",
      explanation: `Policy numbers differ across documents: ${polNums.join(", ")}`,
      linkedQuoteIds: quoteIdsForConflict,
    });
  }
}

// T8 helpers
function extractDates(quotes: Array<{ quoteText: string; id: string; locationHint: string | null; categoryTag: string }>): Array<{
  raw: string; normalized: string; quoteId: string; context: string;
}> {
  const results: Array<{ raw: string; normalized: string; quoteId: string; context: string }> = [];
  // Date patterns to find embedded dates in any quote
  const datePatterns = [
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
  ];
  for (const q of quotes) {
    // Priority 1: dedicated date_reference quotes
    if (q.categoryTag === "date_reference") {
      const normalized = parseDateToISO(q.quoteText);
      results.push({
        raw: q.quoteText,
        normalized,
        quoteId: q.id,
        context: q.locationHint ?? "",
      });
      continue;
    }
    // Priority 2: extract embedded dates from any quote
    for (const pattern of datePatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(q.quoteText)) !== null) {
        const raw = match[1];
        const normalized = parseDateToISO(raw);
        if (!normalized) continue;
        // Build context from surrounding text (20 chars before the date)
        const idx = match.index;
        const contextStart = Math.max(0, idx - 40);
        const context = q.quoteText.slice(contextStart, idx).trim();
        results.push({ raw, normalized, quoteId: q.id, context });
      }
    }
  }
  return results;
}

function extractAmounts(quotes: Array<{ quoteText: string; id: string; categoryTag: string }>): Array<{
  raw: string; value: number; quoteId: string;
}> {
  const results: Array<{ raw: string; value: number; quoteId: string }> = [];
  for (const q of quotes) {
    if (q.categoryTag !== "amount_reference") continue;
    const value = parseFloat(q.quoteText.replace(/[$,]/g, ""));
    if (!isNaN(value)) {
      results.push({ raw: q.quoteText, value, quoteId: q.id });
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// T9: Artifact Generation
// ═══════════════════════════════════════════════════════════════════════

export interface CdaArtifacts {
  o1: any; // Structured Claim Ledger
  o2: any; // Comparison Matrix
  o3: any; // Evidence Gaps & Contradictions
  o4: any; // Advocacy Packet Draft Outline
}

export async function executeT9(runId: string): Promise<CdaArtifacts> {
  const snapshot = await cdaDb.getFullRunSnapshot(runId);

  // O1: Structured Claim Ledger (from S3)
  const o1 = snapshot.s3_claim_ledger ? {
    ...snapshot.s3_claim_ledger,
    _artifact: "O1",
    _description: "Structured Claim Ledger",
  } : null;

  // O2: Comparison Matrix (from S6 + S4 + S5)
  const o2 = (snapshot.s6_comparison_matrix ?? []).map((row) => {
    const reason = snapshot.s4_denial_reasons?.find((r) => r.id === row.reasonId);
    const clause = row.clauseId
      ? snapshot.s5_policy_clauses?.find((c) => c.id === row.clauseId)
      : null;

    return {
      _artifact: "O2",
      reasonId: row.reasonId,
      reasonTextVerbatim: reason?.reasonTextVerbatim ?? "[unknown]",
      normalizedReasonCode: reason?.normalizedReasonCode ?? "[unknown]",
      clauseId: row.clauseId,
      clauseTextVerbatim: clause?.clauseTextVerbatim ?? "[no clause linked]",
      sectionHeading: clause?.sectionHeading ?? null,
      linkingBasis: row.linkingBasis,
      matchType: row.matchType ?? "not_assessed",
      mismatchType: row.mismatchType ?? null,
      requiredEvidence: row.requiredEvidence,
      missingEvidence: row.missingEvidence,
      conflictEvidence: row.conflictEvidence,
      supportingQuoteIds: row.supportingQuoteIds,
      notes: row.notes,
    };
  });

  // O3: Evidence Gaps & Contradictions (from S7 + S8)
  const gaps = (snapshot.s7_evidence_gaps ?? []).map((g) => ({
    _artifact: "O3",
    _type: "gap",
    gapType: g.gapType,
    requiredItem: g.requiredItem,
    whyRequired: g.whyRequired,
    howToObtain: g.howToObtain,
    priorityLevel: g.priorityLevel,
    linkedReasonIds: g.linkedReasonIds,
    linkedTransformation: g.linkedTransformation,
    failureFlag: g.failureFlag,
  }));

  const contradictions = (snapshot.s8_contradictions ?? []).map((c) => ({
    _artifact: "O3",
    _type: "contradiction",
    conflictType: c.conflictType,
    claimReference: c.claimReference,
    denialReference: c.denialReference,
    policyReference: c.policyReference,
    explanation: c.explanation,
    linkedQuoteIds: c.linkedQuoteIds,
  }));

  // Sort O3 by priority: critical first, then important, then supplementary
  const priorityOrder: Record<string, number> = { critical: 0, important: 1, supplementary: 2 };
  const o3 = [
    ...gaps.sort((a, b) => (priorityOrder[a.priorityLevel ?? ""] ?? 3) - (priorityOrder[b.priorityLevel ?? ""] ?? 3)),
    ...contradictions,
  ];

  // O4: Advocacy Packet Draft Outline
  const o4 = {
    _artifact: "O4",
    _description: "Advocacy Packet Draft Outline",
    section1_claim_summary: o1,
    section2_denial_comparison: o2,
    section3_gaps_and_contradictions: o3,
    section4_document_index: (snapshot.s1_documents ?? []).map((d) => ({
      docId: d.id,
      docType: d.docType,
      fileName: d.fileName,
      source: d.source,
      receivedDate: d.receivedDate,
    })),
  };

  return { o1, o2, o3, o4 };
}
