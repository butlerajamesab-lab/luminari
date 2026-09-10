import { createHash } from "node:crypto";

import {
  project_case_entities,
  resolve_source_artifact_binding,
} from "./intake-case-runtime-projection";

type EntityProjection = Awaited<ReturnType<typeof project_case_entities>>;
type EntityMention = EntityProjection["canonical_entities"][number]["raw_mentions"][number];

export type DocumentConnectionEvidence = {
  documentId: number;
  documentName: string | null;
  sourceArtifactId: string;
  artifactKey: string;
  sessionId: string;
  mentionText: string;
  charStart: number;
  charEnd: number;
  bindingProvenanceRefs: string[];
  sourceContext: string | null;
  sourceContextOffset: number | null;
};

export type DocumentConnectionBasis = {
  canonicalEntityId: string;
  canonicalEntityName: string;
  sourceMentionCount: number;
  targetMentionCount: number;
  source: DocumentConnectionEvidence;
  target: DocumentConnectionEvidence;
};

export type DocumentConnection = {
  id: number;
  caseId: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  correlationType: "shared_entity";
  description: string;
  sharedIdentifiers: string[];
  evidenceStatus: "source_linked";
  evidenceCount: number;
  basis: DocumentConnectionBasis[];
  sourceDocument: { id: number; filename: string | null; fileType: string | null };
  targetDocument: { id: number; filename: string | null; fileType: string | null };
  canonicalConnectionId: string;
  canonicalOutputHashes: string[];
  canonicalReceiptHashes: string[];
  projectionSource: "universal_intake_spine";
};

function mention_evidence(
  mention: EntityMention,
  projection: EntityProjection,
): DocumentConnectionEvidence | null {
  if (!mention.intake_session_id || typeof mention.raw_text !== "string"
    || !mention.raw_text.trim() || !Number.isSafeInteger(mention.span_offset)
    || mention.span_offset < 0) return null;

  // Match the producing session before resolving a source. An identically
  // hashed document in another session cannot rescue a missing source binding.
  const artifacts = (projection.source_artifacts.get(mention.artifact_key) ?? [])
    .filter(artifact => artifact.intake_session_id === mention.intake_session_id);
  const binding = resolve_source_artifact_binding(artifacts);
  if (binding.binding_state !== "bound" || binding.document_id === null) return null;

  const contextMention = mention as EntityMention & {
    source_context?: string;
    source_context_offset?: number;
  };
  const contextOffset = contextMention.source_context_offset;
  const context = contextMention.source_context;
  const hasExactContext = typeof context === "string"
    && Number.isSafeInteger(contextOffset)
    && contextOffset! >= 0
    && mention.span_offset >= contextOffset!
    && context.slice(mention.span_offset - contextOffset!, mention.span_offset - contextOffset! + mention.raw_text.length) === mention.raw_text;

  return {
    documentId: binding.document_id,
    documentName: binding.filename,
    sourceArtifactId: artifacts[0].artifact_id,
    artifactKey: mention.artifact_key,
    sessionId: mention.intake_session_id,
    mentionText: mention.raw_text,
    charStart: mention.span_offset,
    charEnd: mention.span_offset + mention.raw_text.length,
    bindingProvenanceRefs: [...new Set((mention.binding_provenance_refs ?? [])
      .filter(ref => typeof ref === "string" && ref.trim()))].sort(),
    sourceContext: hasExactContext ? context! : null,
    sourceContextOffset: hasExactContext ? contextOffset! : null,
  };
}

function evidence_key(evidence: DocumentConnectionEvidence): string {
  return JSON.stringify([
    evidence.sessionId, evidence.sourceArtifactId, evidence.artifactKey,
    evidence.charStart, evidence.charEnd, evidence.mentionText,
  ]);
}

/**
 * A read-only view of identical canonical entities mentioned by two documents.
 * The paired source spans explain the overlap; they do not establish that an
 * event occurred, that sources are independent, or that a claim is corroborated.
 */
export function build_document_connections(
  caseId: number,
  projection: EntityProjection,
): DocumentConnection[] {
  if (!Number.isSafeInteger(caseId) || caseId <= 0) throw new Error("Invalid document connection case identity");
  if (projection.state !== "canonical_projection") return [];
  const pairs = new Map<string, DocumentConnection>();
  const displayEntities = new Map(projection.entities.map(entity => [entity.canonicalEntityId, entity]));

  for (const entity of [...projection.canonical_entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
    if (!entity.entity_id || !entity.canonical_name) continue;
    const displayEntity = displayEntities.get(entity.entity_id);
    const documents = new Map<number, Map<string, DocumentConnectionEvidence>>();
    for (const mention of entity.raw_mentions) {
      const evidence = mention_evidence(mention, projection);
      if (!evidence) continue;
      const mentions = documents.get(evidence.documentId) ?? new Map<string, DocumentConnectionEvidence>();
      mentions.set(evidence_key(evidence), evidence);
      documents.set(evidence.documentId, mentions);
    }
    const documentIds = [...documents.keys()].sort((a, b) => a - b);
    for (let sourceIndex = 0; sourceIndex < documentIds.length; sourceIndex++) {
      for (let targetIndex = sourceIndex + 1; targetIndex < documentIds.length; targetIndex++) {
        const sourceDocumentId = documentIds[sourceIndex];
        const targetDocumentId = documentIds[targetIndex];
        const sourceMentions = [...documents.get(sourceDocumentId)!.values()].sort((a, b) => evidence_key(a).localeCompare(evidence_key(b)));
        const targetMentions = [...documents.get(targetDocumentId)!.values()].sort((a, b) => evidence_key(a).localeCompare(evidence_key(b)));
        const source = sourceMentions[0];
        const target = targetMentions[0];
        const pairKey = `${sourceDocumentId}:${targetDocumentId}:shared_entity`;
        let connection = pairs.get(pairKey);
        if (!connection) {
          const digest = createHash("sha256").update(`document_connection:${caseId}:${pairKey}`).digest("hex");
          connection = {
            id: -(Number.parseInt(digest.slice(0, 13), 16) + 1),
            caseId,
            sourceDocumentId,
            targetDocumentId,
            correlationType: "shared_entity",
            description: "These documents mention the same entity. Shared mentions alone do not establish corroboration or independent sources.",
            sharedIdentifiers: [],
            evidenceStatus: "source_linked",
            evidenceCount: 0,
            basis: [],
            sourceDocument: { id: sourceDocumentId, filename: source.documentName, fileType: null },
            targetDocument: { id: targetDocumentId, filename: target.documentName, fileType: null },
            canonicalConnectionId: `document_connection:${digest}`,
            canonicalOutputHashes: [],
            canonicalReceiptHashes: [],
            projectionSource: "universal_intake_spine",
          };
          pairs.set(pairKey, connection);
        }
        connection.basis.push({
          canonicalEntityId: entity.entity_id,
          canonicalEntityName: displayEntity?.name ?? entity.canonical_name,
          sourceMentionCount: sourceMentions.length,
          targetMentionCount: targetMentions.length,
          source,
          target,
        });
        connection.canonicalOutputHashes.push(...(displayEntity?.canonicalOutputHashes ?? []));
        connection.canonicalReceiptHashes.push(...(displayEntity?.canonicalReceiptHashes ?? []));
      }
    }
  }

  const connections = [...pairs.values()].sort((a, b) =>
    a.sourceDocumentId - b.sourceDocumentId || a.targetDocumentId - b.targetDocumentId);
  const seenIds = new Set<number>();
  for (const connection of connections) {
    if (seenIds.has(connection.id)) throw new Error("Document connection projection identity collision");
    seenIds.add(connection.id);
    connection.evidenceCount = connection.basis.length;
    connection.sharedIdentifiers = connection.basis.map(basis => basis.canonicalEntityName);
    connection.canonicalOutputHashes = [...new Set(connection.canonicalOutputHashes)].sort();
    connection.canonicalReceiptHashes = [...new Set(connection.canonicalReceiptHashes)].sort();
  }
  return connections;
}

export async function project_case_document_connections(caseId: number): Promise<DocumentConnection[]> {
  return build_document_connections(caseId, await project_case_entities(caseId));
}
