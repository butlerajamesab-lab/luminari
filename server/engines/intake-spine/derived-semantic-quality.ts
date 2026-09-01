import type { ChronologyEvent } from "./layer-4-chronology_reconstruction";
import type { Entity } from "./layer-6-entity_registry";
import {
  isRelationshipTypeCompatible,
  type Relationship,
} from "./layer-7-relationship_graph";
import type { StateTransition } from "./layer-9-state_timeline";
import type { ParsedArtifact } from "./parsing-substrate";
import {
  classifySemanticArtifact,
  cmsSurveyDate,
  isCmsHeaderOrFooterText,
  isDateOutsideCmsRecordRange,
  isExcludedFromDominantSemanticLane,
  isSmsTransportMetadataLeak,
  semanticSpansForArtifact,
} from "./semantic-substrate";

export type DerivedSemanticQualityInput = {
  artifacts: ParsedArtifact[];
  chronology: ChronologyEvent[];
  entities: Entity[];
  relationships: Relationship[];
  state_transitions: StateTransition[];
};

export type DerivedSemanticQualityIssue = {
  code: string;
  subject: string;
  detail: string;
};

// Keep this intentionally case-sensitive and aligned with Layer 6. Generic
// prose such as "staff did" is not a document alias; "Staff E" is.
const CMS_ALIAS_PATTERN = /\b(?:Resident\s+\d+[A-Za-z]?|Staff\s+[A-Z]{1,3})\b/g;
const CMS_ENTITY_FURNITURE_PATTERN =
  /^(?:cms|form\s+cms-?2567|clia\s+identification\s+number|date\s+survey\s+completed|provider\s*\/\s*supplier\s*\/\s*clia|form\s+approved\s+omb|previous\s+versions\s+obsolete)$/i;

/**
 * Refuse to seal any derived semantic layer when its outputs violate source,
 * identity, chronology, or graph invariants. Layers 1-3 remain independently
 * preservable; this assertion belongs immediately before Layers 4/6/7/9 are
 * persisted.
 */
export function assertDerivedSemanticQuality(
  input: DerivedSemanticQualityInput,
): void {
  const issues = collectDerivedSemanticQualityIssues(input);
  if (issues.length === 0) return;
  throw new Error(
    `intake_derived_semantic_quality_gate_failed:${issues
      .map((issue) => `${issue.code}:${issue.subject}`)
      .join("|")}`,
  );
}

export function collectDerivedSemanticQualityIssues(
  input: DerivedSemanticQualityInput,
): DerivedSemanticQualityIssue[] {
  const issues: DerivedSemanticQualityIssue[] = [];
  const artifactsByKey = new Map(
    input.artifacts.map((artifact) => [artifact.artifact_key, artifact]),
  );
  const entitiesById = new Map(
    input.entities.map((entity) => [entity.entity_id, entity]),
  );
  const excludedArtifactKeys = new Set(
    input.artifacts
      .filter((artifact) =>
        isExcludedFromDominantSemanticLane(artifact, input.artifacts),
      )
      .map((artifact) => artifact.artifact_key),
  );
  const cmsArtifactsByKey = new Map(
    input.artifacts
      .filter((artifact) => classifySemanticArtifact(artifact) === "cms_2567")
      .map((artifact) => [artifact.artifact_key, artifact]),
  );
  const smsArtifactKeys = new Set(
    input.artifacts
      .filter(
        (artifact) => classifySemanticArtifact(artifact) === "sms_backup_xml",
      )
      .map((artifact) => artifact.artifact_key),
  );

  for (const artifact of input.artifacts) {
    if (!smsArtifactKeys.has(artifact.artifact_key)) continue;
    if (isSmsTransportMetadataLeak(artifact.extracted_text)) {
      pushIssue(
        issues,
        "sms_transport_metadata_in_extracted_text",
        artifact.artifact_key,
        "Raw XML or transport attributes entered parsed text",
      );
    }
    if (artifact.spans.some((span) => span.source_kind !== "sms_message")) {
      pushIssue(
        issues,
        "sms_span_missing_message_provenance",
        artifact.artifact_key,
        "Every parsed SMS span must carry message provenance",
      );
    }
  }

  for (const relationship of input.relationships) {
    const entityA = entitiesById.get(relationship.entity_a_id);
    const entityB = entitiesById.get(relationship.entity_b_id);
    if (!entityA || !entityB) {
      pushIssue(
        issues,
        "relationship_missing_endpoint",
        relationship.relationship_id,
        `Expected both endpoints; found a=${Boolean(entityA)} b=${Boolean(entityB)}`,
      );
      continue;
    }
    if (relationship.entity_a_id === relationship.entity_b_id) {
      pushIssue(
        issues,
        "relationship_self_endpoint",
        relationship.relationship_id,
        "A relationship cannot connect an entity to itself",
      );
    }
    if (!isRelationshipTypeCompatible(relationship, entitiesById)) {
      pushIssue(
        issues,
        "relationship_incompatible_endpoint_type",
        relationship.relationship_id,
        `a:${relationship.role_a}:${entityA.type},b:${relationship.role_b}:${entityB.type}`,
      );
    }

    for (const source of relationship.source_refs) {
      if (
        smsArtifactKeys.has(source.artifact_key) &&
        isSmsTransportMetadataLeak(source.span_text)
      ) {
        pushIssue(
          issues,
          "sms_transport_metadata_relationship",
          relationship.relationship_id,
          source.artifact_key,
        );
      }
      if (excludedArtifactKeys.has(source.artifact_key)) {
        pushIssue(
          issues,
          "excluded_artifact_relationship",
          relationship.relationship_id,
          source.artifact_key,
        );
      }
      if (
        cmsArtifactsByKey.has(source.artifact_key) &&
        isCmsHeaderOrFooterText(source.span_text)
      ) {
        pushIssue(
          issues,
          "cms_furniture_relationship",
          relationship.relationship_id,
          source.artifact_key,
        );
      }
    }
  }

  for (const event of input.chronology) {
    if (
      smsArtifactKeys.has(event.source_artifact_key) &&
      isSmsTransportMetadataLeak(event.event_text)
    ) {
      pushIssue(
        issues,
        "sms_transport_metadata_chronology",
        event.event_id,
        event.source_artifact_key,
      );
    }
    if (excludedArtifactKeys.has(event.source_artifact_key)) {
      pushIssue(
        issues,
        "excluded_artifact_chronology",
        event.event_id,
        event.source_artifact_key,
      );
    }
    const cmsArtifact = cmsArtifactsByKey.get(event.source_artifact_key);
    if (!cmsArtifact) continue;
    if (isCmsHeaderOrFooterText(event.event_text)) {
      pushIssue(
        issues,
        "cms_furniture_chronology",
        event.event_id,
        event.source_artifact_key,
      );
    }
    const surveyDate = cmsSurveyDate(cmsArtifact);
    if (
      event.date &&
      surveyDate &&
      isDateOutsideCmsRecordRange(event.date, surveyDate)
    ) {
      pushIssue(
        issues,
        "cms_future_chronology_date",
        event.event_id,
        `${event.date}>${surveyDate}`,
      );
    }
  }

  for (const transition of input.state_transitions) {
    if (
      smsArtifactKeys.has(transition.source_artifact_key) &&
      isSmsTransportMetadataLeak(transition.source_text)
    ) {
      pushIssue(
        issues,
        "sms_transport_metadata_state",
        transition.transition_id,
        transition.source_artifact_key,
      );
    }
    if (excludedArtifactKeys.has(transition.source_artifact_key)) {
      pushIssue(
        issues,
        "excluded_artifact_state",
        transition.transition_id,
        transition.source_artifact_key,
      );
    }
    const cmsArtifact = cmsArtifactsByKey.get(transition.source_artifact_key);
    if (!cmsArtifact) continue;
    if (isCmsHeaderOrFooterText(transition.source_text)) {
      pushIssue(
        issues,
        "cms_furniture_state",
        transition.transition_id,
        transition.source_artifact_key,
      );
    }
    const surveyDate = cmsSurveyDate(cmsArtifact);
    if (
      transition.transition_date &&
      surveyDate &&
      isDateOutsideCmsRecordRange(transition.transition_date, surveyDate)
    ) {
      pushIssue(
        issues,
        "cms_future_state_date",
        transition.transition_id,
        `${transition.transition_date}>${surveyDate}`,
      );
    }
  }

  for (const entity of input.entities) {
    const aliasArtifactKeys = new Set<string>();
    for (const mention of entity.raw_mentions) {
      if (!artifactsByKey.has(mention.artifact_key)) {
        pushIssue(
          issues,
          "entity_missing_source_artifact",
          entity.entity_id,
          mention.artifact_key,
        );
        continue;
      }
      if (
        smsArtifactKeys.has(mention.artifact_key) &&
        isSmsTransportMetadataLeak(mention.raw_text)
      ) {
        pushIssue(
          issues,
          "sms_transport_metadata_entity",
          entity.entity_id,
          mention.raw_text,
        );
      }
      if (excludedArtifactKeys.has(mention.artifact_key)) {
        pushIssue(
          issues,
          "excluded_artifact_entity",
          entity.entity_id,
          mention.artifact_key,
        );
      }
      if (
        cmsArtifactsByKey.has(mention.artifact_key) &&
        isCmsEntityFurniture(mention.raw_text)
      ) {
        pushIssue(
          issues,
          "cms_furniture_entity",
          entity.entity_id,
          mention.raw_text,
        );
      }
      if (isCmsAlias(mention.raw_text))
        aliasArtifactKeys.add(mention.artifact_key);
    }
    if (aliasArtifactKeys.size > 0 && entity.type !== "person") {
      pushIssue(
        issues,
        "cms_alias_not_person",
        entity.entity_id,
        entity.canonical_name,
      );
    }
    if (aliasArtifactKeys.size > 1) {
      pushIssue(
        issues,
        "cms_alias_cross_document_identity",
        entity.entity_id,
        [...aliasArtifactKeys].sort().join(","),
      );
    }
  }

  validateCmsAliases(input, cmsArtifactsByKey, issues);

  return dedupeIssues(issues).sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.subject.localeCompare(b.subject) ||
      a.detail.localeCompare(b.detail),
  );
}

function validateCmsAliases(
  input: DerivedSemanticQualityInput,
  cmsArtifactsByKey: Map<string, ParsedArtifact>,
  issues: DerivedSemanticQualityIssue[],
): void {
  for (const [artifactKey, artifact] of cmsArtifactsByKey) {
    for (const span of semanticSpansForArtifact(artifact, input.artifacts)) {
      CMS_ALIAS_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CMS_ALIAS_PATTERN.exec(span.text)) !== null) {
        const alias = normalizeAlias(match[0]);
        const absoluteOffset = span.start_offset + match.index;
        const matching = input.entities.filter(
          (entity) =>
            entity.type === "person" &&
            entity.raw_mentions.some(
              (mention) =>
                mention.artifact_key === artifactKey &&
                normalizeAlias(mention.raw_text) === alias &&
                mention.span_offset === absoluteOffset,
            ),
        );
        if (matching.length !== 1) {
          pushIssue(
            issues,
            "cms_alias_missing_document_person",
            `${artifactKey}:${absoluteOffset}`,
            match[0],
          );
        }
      }
    }
  }
}

function isCmsEntityFurniture(rawText: string): boolean {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  return (
    CMS_ENTITY_FURNITURE_PATTERN.test(normalized) ||
    isCmsHeaderOrFooterText(normalized)
  );
}

function isCmsAlias(rawText: string): boolean {
  CMS_ALIAS_PATTERN.lastIndex = 0;
  const result = CMS_ALIAS_PATTERN.test(rawText.trim());
  CMS_ALIAS_PATTERN.lastIndex = 0;
  return result;
}

function normalizeAlias(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function pushIssue(
  issues: DerivedSemanticQualityIssue[],
  code: string,
  subject: string,
  detail: string,
): void {
  issues.push({ code, subject, detail });
}

function dedupeIssues(
  issues: DerivedSemanticQualityIssue[],
): DerivedSemanticQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.subject}|${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
