import { computeHash, EngineResult, FactStatus, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { Entity } from './layer-6-entity_registry';
import { ParsedArtifact, TextSpan } from './parsing-substrate';
import { VerificationRecord } from './layer-5-verification_gate';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StateTransition {
  transition_id: string;
  entity_id: string;
  /**
   * from_state is ONLY populated if the source text explicitly states
   * the prior state. If the text says "was terminated" without stating
   * "was employed," from_state is null — NOT inferred.
   */
  from_state: string | null;
  to_state: string;
  transition_date: string | null; // ISO date, null if not explicitly dated
  source_artifact_key: string;
  source_span_offset: number;
  source_text: string; // verbatim text containing the transition
  verification_status: FactStatus;
}

export interface Layer9Input {
  entities: Entity[];
  artifacts: ParsedArtifact[];
  verification_records: VerificationRecord[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * State-change verb vocabulary.
 * Each entry maps a verb/phrase to a to_state.
 * from_state is NEVER inferred — only populated if explicitly stated in source.
 * 
 * This vocabulary is the versioned rule set (R in Y = F_v(X,R)).
 */
const STATE_CHANGE_VOCABULARY: Array<{
  pattern: RegExp;
  to_state: string;
  domain: string;
}> = [
  // Employment
  { pattern: /\b(?:was |been |got )?terminated\b/i, to_state: 'terminated', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?fired\b/i, to_state: 'terminated', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?laid off\b/i, to_state: 'laid_off', domain: 'employment' },
  { pattern: /\bresigned\b/i, to_state: 'resigned', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?hired\b/i, to_state: 'employed', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?promoted\b/i, to_state: 'promoted', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?demoted\b/i, to_state: 'demoted', domain: 'employment' },
  { pattern: /\b(?:was |been |got )?suspended\b/i, to_state: 'suspended', domain: 'employment' },

  // Housing
  { pattern: /\b(?:was |been |got )?evicted\b/i, to_state: 'evicted', domain: 'housing' },
  { pattern: /\beviction notice\b/i, to_state: 'eviction_notice_served', domain: 'housing' },
  { pattern: /\bmoved in\b/i, to_state: 'housed', domain: 'housing' },
  { pattern: /\blease (?:was )?(?:signed|executed)\b/i, to_state: 'lease_active', domain: 'housing' },
  { pattern: /\blease (?:was )?terminated\b/i, to_state: 'lease_terminated', domain: 'housing' },

  // Benefits
  { pattern: /\b(?:was |been |got )?(?:benefits? )?denied\b/i, to_state: 'denied', domain: 'benefits' },
  { pattern: /\b(?:was |been |got )?(?:benefits? )?approved\b/i, to_state: 'approved', domain: 'benefits' },
  { pattern: /\b(?:benefits? )?(?:was |were |been )?terminated\b/i, to_state: 'benefits_terminated', domain: 'benefits' },
  { pattern: /\bappealed\b/i, to_state: 'appealed', domain: 'benefits' },
  { pattern: /\bapplied (?:for)\b/i, to_state: 'applied', domain: 'benefits' },

  // Insurance
  { pattern: /\bclaim (?:was |been )?denied\b/i, to_state: 'claim_denied', domain: 'insurance' },
  { pattern: /\bclaim (?:was |been )?filed\b/i, to_state: 'claim_filed', domain: 'insurance' },
  { pattern: /\bpolicy (?:was |been )?cancelled\b/i, to_state: 'policy_cancelled', domain: 'insurance' },

  // Legal
  { pattern: /\bfiled (?:a )?complaint\b/i, to_state: 'complaint_filed', domain: 'legal' },
  { pattern: /\bfiled (?:a )?(?:law)?suit\b/i, to_state: 'lawsuit_filed', domain: 'legal' },
  { pattern: /\bcharged? (?:was )?filed\b/i, to_state: 'charge_filed', domain: 'legal' },
];

// Date patterns for extracting transition dates
const DATE_PATTERNS = [
  /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
  /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g,
  /\b(\d{4}-\d{2}-\d{2})\b/g,
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 9: State Timeline
 * 
 * Tracks state changes for each entity over time.
 * CRITICAL: from_state is ONLY populated if the source text explicitly
 * states the prior state. "Was terminated" → to_state: terminated, from_state: null.
 * "Was terminated from his position as manager" → to_state: terminated, from_state: null
 * (being a manager is a role, not a state in our vocabulary).
 * 
 * Only "was employed and then terminated" → from_state: employed, to_state: terminated.
 */
export function processLayer9(input: Layer9Input): EngineResult<StateTransition[]> {
  const input_hash = computeHash({
    entities: input.entities.map(e => e.entity_id),
    artifacts: input.artifacts.map(a => a.raw_bytes_sha256),
    verification: input.verification_records.map(v => v.fact_key),
  });
  const unresolved: UnresolvedDependency[] = [];

  const transitions: StateTransition[] = [];

  for (const artifact of input.artifacts) {
    if (artifact.extraction_status !== 'success') continue;

    for (const span of artifact.spans) {
      const spanText = span.text;

      // Find entities mentioned in this span
      const entitiesInSpan: Entity[] = [];
      for (const entity of input.entities) {
        for (const mention of entity.raw_mentions) {
          if (mention.artifact_key === artifact.artifact_key) {
            // Check if mention is in this span
            if (mention.span_offset >= span.start_offset && mention.span_offset < span.end_offset) {
              if (!entitiesInSpan.includes(entity)) entitiesInSpan.push(entity);
            }
          }
        }
        // Also check by name in span text
        if (spanText.includes(entity.raw_mentions[0]?.raw_text || '') && !entitiesInSpan.includes(entity)) {
          entitiesInSpan.push(entity);
        }
      }

      // For each state-change pattern found in this span
      for (const vocab of STATE_CHANGE_VOCABULARY) {
        vocab.pattern.lastIndex = 0;
        const match = vocab.pattern.exec(spanText);
        if (!match) continue;

        // Entity and transition must share a SENTENCE (bounded by periods/newlines).
        // If multiple entities appear in the same sentence, emit unresolved.
        const sentStart = Math.max(spanText.lastIndexOf('.', match.index), spanText.lastIndexOf('\n', match.index)) + 1;
        const sentEndIdx = spanText.indexOf('.', match.index);
        const sentEnd = sentEndIdx >= 0 ? sentEndIdx : spanText.length;
        const sentence = spanText.substring(sentStart, sentEnd);

        // Find entities mentioned in THIS sentence
        const entitiesInSentence: Entity[] = [];
        for (const entity of entitiesInSpan) {
          const rawText = entity.raw_mentions[0]?.raw_text || entity.canonical_name;
          if (sentence.toLowerCase().includes(rawText.toLowerCase())) {
            entitiesInSentence.push(entity);
          }
        }

        if (entitiesInSentence.length === 0) continue; // No entity in same sentence
        if (entitiesInSentence.length > 1) {
          // Multiple entities in same sentence — ambiguous attribution
          unresolved.push({
            field: `transition:${vocab.to_state}`,
            reason: 'unresolved',
            detail: `Multiple entities in sentence: ${entitiesInSentence.map(e => e.canonical_name).join(', ')}. Cannot determine which entity transitioned.`,
          });
          continue;
        }

        const nearestEntity = entitiesInSentence[0];

        // Extract date from the same span (if present)
        let transitionDate: string | null = null;
        for (const datePattern of DATE_PATTERNS) {
          datePattern.lastIndex = 0;
          const dateMatch = datePattern.exec(spanText);
          if (dateMatch) {
            transitionDate = normalizeDate(dateMatch[1]);
            break;
          }
        }

        // from_state is null — we do NOT infer prior state
        transitions.push({
          transition_id: `trans_${computeHash(`${nearestEntity.entity_id}|${vocab.to_state}|${span.start_offset}`)}`.substring(0, 16),
          entity_id: nearestEntity.entity_id,
          from_state: null, // NEVER inferred
          to_state: vocab.to_state,
          transition_date: transitionDate,
          source_artifact_key: artifact.artifact_key,
          source_span_offset: span.start_offset,
          source_text: spanText,
          verification_status: 'document_stated',
        });
      }
    }
  }

  // Sort for deterministic output
  const sorted = transitions.sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  const output_hash = computeHash(sorted);

  return {
    layer_name: 'state_timeline',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sorted,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDate(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
