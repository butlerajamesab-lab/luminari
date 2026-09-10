import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { ParsedArtifact } from './parsing-substrate';
import {
  classifySemanticArtifact,
  isExcludedFromDominantSemanticLane,
  SEMANTIC_SUBSTRATE_VERSION,
  semanticSpansForArtifact,
} from './semantic-substrate';

export type EntityType = 'person' | 'organization' | 'address' | 'contact' | 'unknown';

export interface Entity {
  entity_id: string;
  type: EntityType;
  canonical_name: string;
  raw_mentions: EntityMention[];
  review_candidates: ReviewCandidate[];
}

export interface EntityMention {
  raw_text: string;
  artifact_key: string;
  span_offset: number;
  binding_provenance_refs?: string[];
  source_context?: string;
  source_context_offset?: number;
}

export interface ReviewCandidate {
  candidate_entity_id: string;
  similarity_type: 'levenshtein_near_match';
  distance: number;
  reason: string;
}

export interface Layer6Input {
  artifacts: ParsedArtifact[];
  message_author_bindings?: MessageAuthorBinding[];
}

export interface MessageAuthorBinding {
  artifact_key: string;
  message_direction: 'received' | 'sent';
  source_contact_name?: string;
  author_canonical_name: string;
  provenance_ref: string;
  verification_state: 'verified';
}

export const LAYER_VERSION = '2.6.4';
export const RULE_VERSION = '2.6.4';

const CARE_PERSON_NAME = "[A-Z][a-z]+(?:[’'-][A-Z]?[a-z]+)*(?:[ \\t]+[A-Z][a-z]+(?:[’'-][A-Z]?[a-z]+)*){0,3}";
const CARE_DECLARANT = `(?:I|${CARE_PERSON_NAME})`;

const ADDRESS_STATE_ABBREVIATIONS: Record<string, string> = {
  wa: 'washington', ca: 'california', or: 'oregon', ny: 'new york', tx: 'texas',
  fl: 'florida', il: 'illinois', pa: 'pennsylvania', oh: 'ohio', az: 'arizona',
};

const ORGANIZATION_TOKEN_STOPLIST = [
  'AND', 'OR', 'THE', 'FROM', 'TO', 'CC', 'BCC', 'RE', 'FW', 'FWD',
  'PDF', 'JPEG', 'JPG', 'PNG', 'DOCX', 'CSV', 'TXT', 'HTML',
  'SMS', 'MMS', 'EMAIL', 'ATTACHMENT', 'ATTACHMENTS', 'PAGE', 'PAGES',
  'DATE', 'TIME', 'SUBJECT', 'NOTE', 'NOTES', 'BENEFIT', 'BENEFITS',
] as const;

const NON_ENTITY_ACRONYM_STOPLIST = [
  'ADL', 'CNA', 'CP', 'DON', 'DPOA', 'LPN', 'MAR', 'MDS', 'NP', 'PCP', 'POA',
  'RN', 'UTI',
] as const;

const PERSON_LEADING_STOPLIST = [
  'Whether', 'Then', 'This', 'That', 'These', 'Those', 'When', 'Where', 'Why', 'How',
  'What', 'Which', 'While', 'After', 'Before', 'Because', 'Although', 'Since', 'Until',
  'I', 'We', 'He', 'She', 'It', 'They', 'Me', 'Us', 'Him', 'Her', 'Them',
  'There', 'Here', 'Someone', 'Somebody', 'Anyone', 'Anybody', 'Everyone', 'Everybody',
  'Nobody', 'Mother', 'Father', 'Mom', 'Dad',
] as const;

export const RULE_MANIFEST = {
  cms_person_alias_pattern: {
    source: '\\b(Resident\\s+\\d+[A-Za-z]?|Staff\\s+[A-Z]{1,3})\\b',
    flags: 'g',
  },
  cms_provider_pattern: {
    source: "\\b([A-Z][A-Za-z'’-]+(?:[ \\t]+[A-Z][A-Za-z'’-]+){1,6}[ \\t]+(?:Home|Hospital|Center|Centre|Clinic|Facility))\\b",
    flags: 'g',
  },
  cms_address_pattern: {
    source: "\\b(\\d{1,5}\\s+[A-Z][A-Za-z'’-]+(?:\\s+[A-Z][A-Za-z'’-]+){0,5}\\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir)(?:\\s+(?:North|South|East|West|N|S|E|W))?)\\b",
    flags: 'g',
  },
  cms_document_scoped_aliases: true,
  mixed_corpus_billing_policy: 'preserve_without_semantic_projection',
  person_patterns: [
    { source: '\\b(Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})\\b', flags: 'g' },
    { source: '\\b([A-Z][a-z]+\\s+[A-Z][a-z]+)\\b(?=\\s+(?:was|is|has been|filed|stated|reported|testified|claimed))', flags: 'g' },
  ],
  ambiguous_name_patterns: [
    {
      source: '\\b([A-Z][a-z]{2,})\\b(?=\\s+(?:is|was|has|had|said|reported|stated|called|emailed|texted|visited|lives|lived|resides|resided|needs|needed|receives|received|requested|asked|wants|wanted|cares|cared)\\b)',
      flags: 'g',
    },
    {
      source: '\\b(?:for|with|about|regarding|involving)\\s+([A-Z][a-z]{2,})\\b',
      flags: 'g',
    },
    { source: '\\b([A-Z][a-z]{2,})[’\\\']s\\b', flags: 'g' },
  ],
  organization_patterns: [
    { source: '\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+(?:Inc\\.|LLC|Corp\\.|Corporation|Company|Co\\.))', flags: 'g' },
    { source: '\\b(Department\\s+of\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)(?=\\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\\d)|[,.]|$)', flags: 'g' },
    { source: '\\b(Office\\s+of\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)(?=\\s+(?:on|in|at|for|from|to|by|with|about|the|a|an|\\d)|[,.]|$)', flags: 'g' },
    { source: '\\b([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,4}\\s+(?:Home|Hospital|Center|Centre|Clinic|Facility|Council|Program|Services|Healthcare|Care|Foundation|Association|Agency|Authority|School|University|College|Bank|Insurance|Farm))\\b', flags: 'g' },
    { source: '\\b([A-Z]{2,}(?:\\s+[A-Z]{2,})*)\\b', flags: 'g' },
  ],
  address_pattern: {
    source: '\\b(\\d{1,5}\\s+[A-Z][a-z]+(?:\\s+[A-Z]?[a-z]+)*\\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Cir)\\.?(?:\\s*,\\s*[A-Z][a-z]+(?:\\s+[A-Z]?[a-z]+)*)?(?:\\s*,\\s*[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)?)\\b',
    flags: 'g',
  },
  phone_pattern: { source: '\\b(\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4})\\b', flags: 'g' },
  email_pattern: { source: '\\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\b', flags: 'g' },
  address_state_abbreviations: ADDRESS_STATE_ABBREVIATIONS,
  organization_token_stoplist: ORGANIZATION_TOKEN_STOPLIST,
  non_entity_acronym_stoplist: NON_ENTITY_ACRONYM_STOPLIST,
  person_leading_stoplist: PERSON_LEADING_STOPLIST,
  ambiguous_name_type: 'unknown',
  explicit_care_recipient_patterns: [
    { source: `\\b(${CARE_DECLARANT})[ \\t]+(?:am|is|was)[ \\t]+(${CARE_PERSON_NAME})[’']s[ \\t]+(?:sole[ \\t]+)?(?:caregiver|POA|power of attorney)\\b`, flags: 'g' },
    { source: `\\b(${CARE_DECLARANT})[ \\t]+(?:am|is|was)[ \\t]+(?:(?:the|a)[ \\t]+)?(?:sole[ \\t]+)?(?:caregiver|authorized representative)[ \\t]+for[ \\t]+(${CARE_PERSON_NAME})\\b(?![ \\t]+[A-Z])`, flags: 'g' },
    { source: `\\b(${CARE_DECLARANT})[ \\t]+(?:have|has|had|hold|holds)[ \\t]+(?:a[ \\t]+)?power of attorney[ \\t]+for[ \\t]+(${CARE_PERSON_NAME})\\b(?![ \\t]+[A-Z])`, flags: 'g' },
  ],
  care_classification_uncertain_prefix: {
    source: "\\b(?:if|whether|maybe|perhaps|possibly|may|might|could|would|should|not|never|false|untrue|denies|denied|deny|doubt|doubts|doubted|suppose|supposed|assuming|pretend|pretended|wish|wishes|wished)\\b|n[’']t\\b",
    flags: 'i',
  },
  care_classification_scope: 'affirmative_explicit_recipient_same_artifact_exact_name_only',
  care_classification_identity: 'recompute_person_identity_preserve_original_name_and_source_mentions',
  clinical_subject_pattern: {
    source: `\\b(${CARE_PERSON_NAME})[’']s[ \\t]+(?:[a-z][a-z-]*[ \\t]+){0,4}(?:diagnosis|care assessment)[ \\t]+(?:is|was|remains|remained)\\b(?![ \\t]+(?:not|no|false|untrue|uncertain|unconfirmed|disputed|inconclusive)\\b)`,
    flags: 'g',
  },
  clinical_human_care_context: {
    source: '\\b(?:care (?:conference|plan)|nursing (?:care|assessment|home)|long[- ]term care|skilled nursing|resident care|clinical assessment|patient care)\\b',
    flags: 'i',
  },
  clinical_nonhuman_context: {
    source: '\\b(?:veterinar(?:y|ian)|canine|feline|equine|animal|pet|dog|cat|horse|software|computer|device|engine|vehicle|motor|robot)\\b',
    flags: 'i',
  },
  clinical_context_radius: 600,
  clinical_classification_scope: 'source_named_subject_with_local_human_care_cue_same_message_or_page',
  clinical_claim_policy: 'classify_subject_only_do_not_verify_diagnosis_or_assert_alias_equivalence',
  clinical_organization_exclusion: 'reject_candidates_matching_organization_patterns_or_business_suffixes',
  clinical_business_suffix_pattern: {
    source: '\\b(?:Inc|LLC|Corp|Corporation|Company|Co)\\.?$',
    flags: 'i',
  },
  mention_context: {
    policy: 'exact_source_slice_within_smallest_containing_parsed_span',
    max_chars: 600,
    preceding_chars: 200,
    mismatch_policy: 'omit_without_rewriting',
  },
  organization_abbreviation_expansion: false,
  exact_normalized_match_auto_merge: true,
  levenshtein_review_threshold: 2,
  near_match_auto_merge: false,
  semantic_substrate_version: SEMANTIC_SUBSTRATE_VERSION,
  source_aware_projection: 'exclude_transport_metadata_reactions_and_content_duplicate_archive_members',
  message_author_binding: 'explicit_verified_participant_author_mapping_only',
  message_author_agreement: 'one_normalized_author_identity_with_all_distinct_provenance_refs',
} as const;

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

const PERSON_PATTERNS = RULE_MANIFEST.person_patterns.map(regexFromManifest);
const CARE_RECIPIENT_PATTERNS = RULE_MANIFEST.explicit_care_recipient_patterns.map(regexFromManifest);
const CARE_UNCERTAIN_PREFIX = regexFromManifest(RULE_MANIFEST.care_classification_uncertain_prefix);
const CLINICAL_SUBJECT_PATTERN = regexFromManifest(RULE_MANIFEST.clinical_subject_pattern);
const CLINICAL_HUMAN_CONTEXT = regexFromManifest(RULE_MANIFEST.clinical_human_care_context);
const CLINICAL_NONHUMAN_CONTEXT = regexFromManifest(RULE_MANIFEST.clinical_nonhuman_context);
const CLINICAL_BUSINESS_SUFFIX = regexFromManifest(RULE_MANIFEST.clinical_business_suffix_pattern);
const AMBIGUOUS_NAME_PATTERNS = RULE_MANIFEST.ambiguous_name_patterns.map(regexFromManifest);
const ORG_PATTERNS = RULE_MANIFEST.organization_patterns.map(regexFromManifest);
const ADDRESS_PATTERN = regexFromManifest(RULE_MANIFEST.address_pattern);
const PHONE_PATTERN = regexFromManifest(RULE_MANIFEST.phone_pattern);
const EMAIL_PATTERN = regexFromManifest(RULE_MANIFEST.email_pattern);
const CMS_PERSON_ALIAS_PATTERN = regexFromManifest(RULE_MANIFEST.cms_person_alias_pattern);
const CMS_PROVIDER_PATTERN = regexFromManifest(RULE_MANIFEST.cms_provider_pattern);
const CMS_ADDRESS_PATTERN = regexFromManifest(RULE_MANIFEST.cms_address_pattern);
const ORGANIZATION_STOPLIST = new Set<string>(RULE_MANIFEST.organization_token_stoplist);
const NON_ENTITY_ACRONYMS = new Set<string>(RULE_MANIFEST.non_entity_acronym_stoplist);
const PERSON_PREFIX_STOPLIST = new Set<string>(RULE_MANIFEST.person_leading_stoplist);

export function processLayer6(input: Layer6Input): EngineResult<Entity[]> {
  const artifacts = [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_version = parserVersion(artifacts);
  const input_hash = computeHash({
    artifacts: artifacts.map(artifact => ({
      artifact_key: artifact.artifact_key,
      raw_bytes_sha256: artifact.raw_bytes_sha256,
      parser_version: artifact.parser_version,
      extraction_status: artifact.extraction_status,
      parsed_output_hash: computeHash({ extracted_text: artifact.extracted_text, spans: artifact.spans }),
    })),
    message_author_bindings: normalizedAuthorBindings(input.message_author_bindings),
  });
  const unresolved: UnresolvedDependency[] = [];
  const entityMap = new Map<string, Entity>();
  const personEvidenceByArtifact = new Map<string, Set<string>>();

  for (const artifact of artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `Entity extraction cannot run against artifact state ${artifact.extraction_status}`,
      });
      continue;
    }

    if (isExcludedFromDominantSemanticLane(artifact, artifacts)) {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}:semantic_lane`,
        reason: 'unresolved',
        detail: 'Artifact preserved as evidence but excluded from the dominant CMS-2567 semantic lane',
      });
      continue;
    }

    const artifactClass = classifySemanticArtifact(artifact);
    const semanticSpans = semanticSpansForArtifact(artifact, artifacts, 'entities');

    if (artifactClass === 'cms_2567') {
      for (const span of semanticSpans) {
        CMS_PERSON_ALIAS_PATTERN.lastIndex = 0;
        let aliasMatch: RegExpExecArray | null;
        while ((aliasMatch = CMS_PERSON_ALIAS_PATTERN.exec(span.text)) !== null) {
          addEntity(
            entityMap,
            aliasMatch[1],
            'person',
            artifact.artifact_key,
            span.start_offset + aliasMatch.index,
            true,
          );
        }
      }

      CMS_PROVIDER_PATTERN.lastIndex = 0;
      let providerMatch: RegExpExecArray | null;
      while ((providerMatch = CMS_PROVIDER_PATTERN.exec(artifact.extracted_text)) !== null) {
        const rawName = providerMatch[1];
        if (!rawName || isExcludedOrganizationToken(rawName)) continue;
        addEntity(
          entityMap,
          rawName,
          'organization',
          artifact.artifact_key,
          providerMatch.index + providerMatch[0].indexOf(rawName),
        );
      }

      CMS_ADDRESS_PATTERN.lastIndex = 0;
      let cmsAddressMatch: RegExpExecArray | null;
      while ((cmsAddressMatch = CMS_ADDRESS_PATTERN.exec(artifact.extracted_text)) !== null) {
        addEntity(
          entityMap,
          cmsAddressMatch[1],
          'address',
          artifact.artifact_key,
          cmsAddressMatch.index,
        );
      }
      continue;
    }

    for (const span of semanticSpans) {
      const text = span.text;

      for (const mention of [...explicitCareRecipientMentions(text), ...explicitClinicalSubjectMentions(span, artifact)]) {
        const names = personEvidenceByArtifact.get(artifact.artifact_key) ?? new Set<string>();
        names.add(normalizeEntityName(mention.raw_name, 'person'));
        personEvidenceByArtifact.set(artifact.artifact_key, names);
        addEntity(entityMap, mention.raw_name, 'person', artifact.artifact_key, span.start_offset + mention.offset);
      }

      const authorBindings = authorBindingsForSpan(span, artifact.artifact_key, input.message_author_bindings);
      if (authorBindings.length === 1) {
        const authorBinding = authorBindings[0];
        const firstPersonPattern = /\b(?:I|me|my|mine|myself)\b/gi;
        let firstPersonMatch: RegExpExecArray | null;
        while ((firstPersonMatch = firstPersonPattern.exec(text)) !== null) {
          addBoundEntity(entityMap, authorBinding.author_canonical_name, firstPersonMatch[0], artifact.artifact_key, span.start_offset + firstPersonMatch.index, authorBinding.provenance_refs);
        }
      } else if (span.source_kind === 'sms_message' && /\b(?:I|me|my|mine|myself)\b/i.test(text)) {
        unresolved.push({
          field: `artifact:${artifact.artifact_key}:span:${span.start_offset}:message_author`,
          reason: 'unresolved',
          detail: authorBindings.length === 0
            ? 'First-person SMS author has no verified participant-author binding'
            : 'First-person SMS author has ambiguous verified participant-author bindings',
        });
      }

      for (const pattern of PERSON_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const rawName = match[0].replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+/, '');
          if (isExcludedPersonMention(rawName)) continue;
          addEntity(
            entityMap,
            rawName,
            'person',
            artifact.artifact_key,
            span.start_offset + match.index + match[0].indexOf(rawName),
          );
        }
      }

      for (const pattern of AMBIGUOUS_NAME_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const rawName = match[1];
          if (!rawName || isExcludedPersonMention(rawName)) continue;
          addEntity(
            entityMap,
            rawName,
            'unknown',
            artifact.artifact_key,
            span.start_offset + match.index + match[0].indexOf(rawName),
          );
        }
      }

      for (const pattern of ORG_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const rawName = match[1];
          if (!rawName || rawName.length <= 2 || isExcludedOrganizationToken(rawName)) continue;
          addEntity(entityMap, rawName, 'organization', artifact.artifact_key, span.start_offset + match.index);
        }
      }

      ADDRESS_PATTERN.lastIndex = 0;
      let addressMatch: RegExpExecArray | null;
      while ((addressMatch = ADDRESS_PATTERN.exec(text)) !== null) {
        addEntity(entityMap, addressMatch[1], 'address', artifact.artifact_key, span.start_offset + addressMatch.index);
      }

      PHONE_PATTERN.lastIndex = 0;
      let phoneMatch: RegExpExecArray | null;
      while ((phoneMatch = PHONE_PATTERN.exec(text)) !== null) {
        addEntity(entityMap, phoneMatch[1], 'contact', artifact.artifact_key, span.start_offset + phoneMatch.index);
      }

      EMAIL_PATTERN.lastIndex = 0;
      let emailMatch: RegExpExecArray | null;
      while ((emailMatch = EMAIL_PATTERN.exec(text)) !== null) {
        addEntity(entityMap, emailMatch[1], 'contact', artifact.artifact_key, span.start_offset + emailMatch.index);
      }
    }
  }

  // A bare mention is no longer unknown when the same source explicitly names
  // that person as a care recipient or clinical subject. Another document cannot make
  // that identity decision, and near matches remain review-only.
  for (const [key, entity] of entityMap) {
    if (entity.type !== 'unknown') continue;
    entity.raw_mentions = entity.raw_mentions.filter(mention => {
      if (!personEvidenceByArtifact.get(mention.artifact_key)?.has(entity.canonical_name)) return true;
      addEntity(entityMap, mention.raw_text, 'person', mention.artifact_key, mention.span_offset);
      return false;
    });
    if (entity.raw_mentions.length === 0) entityMap.delete(key);
  }

  const entities = Array.from(entityMap.values()).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (a.type !== b.type) continue;
      const distance = levenshtein(a.canonical_name, b.canonical_name);
      if (distance <= 0 || distance > RULE_MANIFEST.levenshtein_review_threshold) continue;
      a.review_candidates.push({
        candidate_entity_id: b.entity_id,
        similarity_type: 'levenshtein_near_match',
        distance,
        reason: `"${a.canonical_name}" and "${b.canonical_name}" are review-only near matches at distance ${distance}`,
      });
      b.review_candidates.push({
        candidate_entity_id: a.entity_id,
        similarity_type: 'levenshtein_near_match',
        distance,
        reason: `"${b.canonical_name}" and "${a.canonical_name}" are review-only near matches at distance ${distance}`,
      });
    }
  }

  for (const entity of entities) {
    entity.raw_mentions = dedupeMentions(entity.raw_mentions);
    for (const mention of entity.raw_mentions) attachSourceContext(mention, artifacts);
    entity.review_candidates.sort((a, b) => a.candidate_entity_id.localeCompare(b.candidate_entity_id));
  }

  return {
    layer_name: 'entity_registry',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version,
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(entities),
    data: entities,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function attachSourceContext(mention: EntityMention, artifacts: ParsedArtifact[]): void {
  const artifact = artifacts.find(value => value.artifact_key === mention.artifact_key);
  if (!artifact) return;
  const mentionEnd = mention.span_offset + mention.raw_text.length;
  if (artifact.extracted_text.slice(mention.span_offset, mentionEnd) !== mention.raw_text) return;
  const containingSpan = artifact.spans
    .filter(span => span.start_offset <= mention.span_offset && span.end_offset >= mentionEnd)
    .sort((a, b) => (a.end_offset - a.start_offset) - (b.end_offset - b.start_offset)
      || a.start_offset - b.start_offset)[0];
  if (!containingSpan) return;
  const start = Math.max(0, containingSpan.start_offset, mention.span_offset - RULE_MANIFEST.mention_context.preceding_chars);
  const end = Math.min(artifact.extracted_text.length, containingSpan.end_offset, start + RULE_MANIFEST.mention_context.max_chars);
  if (end < mentionEnd) return;
  mention.source_context = artifact.extracted_text.slice(start, end);
  mention.source_context_offset = start;
}

function explicitCareRecipientMentions(text: string): Array<{ raw_name: string; offset: number }> {
  const mentions: Array<{ raw_name: string; offset: number }> = [];
  // Questions and conditional/negated prefixes cannot establish a classification.
  // Inspect only the prefix: a later clause such as "he is not able to speak"
  // does not negate an earlier affirmative caregiver statement.
  if (text.includes('?')) return mentions;
  for (const pattern of CARE_RECIPIENT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if ((match[1] !== 'I' && isExcludedPersonMention(match[1])) || isExcludedPersonMention(match[2])) continue;
      const prefix = text.slice(0, match.index).split(/[.!?;\n]/).at(-1) ?? '';
      if (CARE_UNCERTAIN_PREFIX.test(`${prefix} ${match[1]}`)) continue;
      const raw_name = match[2];
      // The recipient is the last occurrence in a possessive assertion, and
      // this also handles a declarant and recipient with the same written name.
      const offset = match.index + match[0].lastIndexOf(raw_name);
      mentions.push({ raw_name, offset });
    }
  }
  return mentions;
}

function explicitClinicalSubjectMentions(
  span: ParsedArtifact['spans'][number], artifact: ParsedArtifact,
): Array<{ raw_name: string; offset: number }> {
  const mentions: Array<{ raw_name: string; offset: number }> = [];
  if (span.text.includes('?')) return mentions;
  CLINICAL_SUBJECT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLINICAL_SUBJECT_PATTERN.exec(span.text)) !== null) {
    if (isExcludedPersonMention(match[1]) || isClinicalOrganizationCandidate(match[1])) continue;
    const prefix = span.text.slice(0, match.index).split(/[.!?;\n]/).at(-1) ?? '';
    if (CARE_UNCERTAIN_PREFIX.test(`${prefix} ${match[1]}`)) continue;
    const absoluteOffset = span.start_offset + match.index;
    const assertionEnd = absoluteOffset + match[0].length;
    if (artifact.extracted_text.slice(absoluteOffset, assertionEnd) !== match[0]) continue;
    // OCR lines share a page; SMS messages must never borrow a human-care cue
    // from a different message. Archive members must not borrow across images.
    const sourceSpans = span.source_kind === 'sms_message'
      ? artifact.spans.filter(source => source.start_offset <= absoluteOffset && source.end_offset >= assertionEnd)
      : artifact.spans.filter(source => source.page === span.page && source.archive_member_path === span.archive_member_path);
    if (sourceSpans.length === 0) continue;
    const sourceStart = Math.min(...sourceSpans.map(source => source.start_offset));
    const sourceEnd = Math.max(...sourceSpans.map(source => source.end_offset));
    const context = artifact.extracted_text.slice(
      Math.max(sourceStart, absoluteOffset - RULE_MANIFEST.clinical_context_radius),
      Math.min(sourceEnd, assertionEnd + RULE_MANIFEST.clinical_context_radius),
    );
    if (!CLINICAL_HUMAN_CONTEXT.test(context) || CLINICAL_NONHUMAN_CONTEXT.test(context)) continue;
    mentions.push({ raw_name: match[1], offset: match.index });
  }
  return mentions;
}

function isClinicalOrganizationCandidate(rawName: string): boolean {
  if (CLINICAL_BUSINESS_SUFFIX.test(rawName)) return true;
  return ORG_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(rawName);
  });
}

function addBoundEntity(
  map: Map<string, Entity>, canonicalSourceName: string, rawMention: string,
  artifactKey: string, offset: number, provenanceRefs: string[],
): void {
  const type: EntityType = 'person';
  const canonical = normalizeEntityName(canonicalSourceName, type);
  if (canonical.length < 2) return;
  const mapKey = `${type}|${canonical}|global`;
  const mention: EntityMention = { raw_text: rawMention, artifact_key: artifactKey, span_offset: offset, binding_provenance_refs: provenanceRefs };
  const existing = map.get(mapKey);
  if (existing) {
    existing.raw_mentions.push(mention);
    return;
  }
  map.set(mapKey, {
    entity_id: `ent_${computeHash({ type, canonical_name: canonical, scope_key: null }).substring(0, 16)}`,
    type, canonical_name: canonical, raw_mentions: [mention], review_candidates: [],
  });
}

function normalizedAuthorBindings(bindings: MessageAuthorBinding[] | undefined): MessageAuthorBinding[] {
  return [...(bindings ?? [])].sort((a, b) =>
    a.artifact_key.localeCompare(b.artifact_key)
    || a.message_direction.localeCompare(b.message_direction)
    || (a.source_contact_name ?? '').localeCompare(b.source_contact_name ?? '')
    || a.author_canonical_name.localeCompare(b.author_canonical_name)
    || a.provenance_ref.localeCompare(b.provenance_ref));
}

function authorBindingsForSpan(
  span: ParsedArtifact['spans'][number],
  artifactKey: string,
  bindings: MessageAuthorBinding[] | undefined,
): Array<{ author_canonical_name: string; provenance_refs: string[] }> {
  if (span.source_kind !== 'sms_message' || !span.message_direction || span.message_direction === 'unknown') return [];
  const contact = span.message_contact_name?.replace(/\s+/g, ' ').trim().toLowerCase();
  const matchingBindings = normalizedAuthorBindings(bindings).filter(binding =>
    binding.verification_state === 'verified'
    && binding.artifact_key === artifactKey
    && binding.message_direction === span.message_direction
    && (span.message_direction === 'sent'
      ? true
      : Boolean(contact && binding.source_contact_name?.replace(/\s+/g, ' ').trim().toLowerCase() === contact)));
  const byAuthor = new Map<string, Set<string>>();
  for (const binding of matchingBindings) {
    const author = normalizeEntityName(binding.author_canonical_name, 'person');
    const provenanceRefs = byAuthor.get(author) ?? new Set<string>();
    provenanceRefs.add(binding.provenance_ref);
    byAuthor.set(author, provenanceRefs);
  }
  return Array.from(byAuthor, ([author_canonical_name, provenanceRefs]) => ({
    author_canonical_name,
    provenance_refs: Array.from(provenanceRefs).sort(),
  })).sort((a, b) => a.author_canonical_name.localeCompare(b.author_canonical_name));
}

export function isExcludedOrganizationToken(rawName: string): boolean {
  const normalized = rawName.trim().replace(/\s+/g, ' ').toUpperCase();
  if (ORGANIZATION_STOPLIST.has(normalized) || NON_ENTITY_ACRONYMS.has(normalized)) return true;
  const tokens = normalized.split(' ');
  return rawName === rawName.toUpperCase() && NON_ENTITY_ACRONYMS.has(tokens[tokens.length - 1]);
}

export function isExcludedPersonMention(rawName: string): boolean {
  const first = rawName.trim().split(/\s+/)[0] || '';
  return PERSON_PREFIX_STOPLIST.has(first);
}

function normalizeEntityName(name: string, type: EntityType): string {
  let normalized = name.trim().replace(/\s+/g, ' ');
  if (type === 'address') {
    for (const [abbr, full] of Object.entries(ADDRESS_STATE_ABBREVIATIONS)) {
      normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
    }
  }
  return normalized.toLowerCase();
}

function addEntity(
  map: Map<string, Entity>,
  rawName: string,
  type: EntityType,
  artifactKey: string,
  offset: number,
  scopeToArtifact = false,
): void {
  const canonical = normalizeEntityName(rawName, type);
  if (canonical.length < 2) return;
  const scopeKey = scopeToArtifact ? artifactKey : null;
  const mapKey = `${type}|${canonical}|${scopeKey || 'global'}`;
  const mention: EntityMention = { raw_text: rawName, artifact_key: artifactKey, span_offset: offset };
  const existing = map.get(mapKey);
  if (existing) {
    existing.raw_mentions.push(mention);
    return;
  }
  map.set(mapKey, {
    entity_id: `ent_${computeHash({ type, canonical_name: canonical, scope_key: scopeKey }).substring(0, 16)}`,
    type,
    canonical_name: canonical,
    raw_mentions: [mention],
    review_candidates: [],
  });
}

function dedupeMentions(mentions: EntityMention[]): EntityMention[] {
  const map = new Map<string, EntityMention>();
  for (const mention of mentions) {
    map.set(`${mention.artifact_key}|${mention.span_offset}|${mention.raw_text}`, mention);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.artifact_key.localeCompare(b.artifact_key) || a.span_offset - b.span_offset || a.raw_text.localeCompare(b.raw_text),
  );
}

function parserVersion(artifacts: ParsedArtifact[]): string {
  const versions = Array.from(new Set(artifacts.map(artifact => artifact.parser_version))).sort();
  return versions.length === 0 ? 'N/A' : versions.join('|');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
