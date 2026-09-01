import type { Response } from "express";

import * as dbHelpers from "./db";
import { read_case_intake_integrity_projection } from "./intake-case-integrity-projection";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";

export type SovereignExportType = "full-bundle" | "json-dump";
export type CaseReportType =
  | "case-brief"
  | "entity-report"
  | "timeline-report"
  | "relationship-report";

export const EXPORT_TYPE_HEADER = "X-Luminari-Export-Type";
export const CURRENT_EXPORT_CONTRACT =
  "luminari.case-export.current-governed-projection.v1";

type ExportRecord = Record<string, any>;

type LayerProjection = {
  state: "not_projected" | "canonical_projection";
  rows: ExportRecord[];
  receipts: ExportRecord[];
};

export type CurrentCaseExportData = {
  export_contract: string;
  generated_at: string;
  projection_scope: ExportRecord;
  case: ExportRecord;
  snapshot: ExportRecord | null;
  summary: ExportRecord;
  sources: ExportRecord[];
  entities: ExportRecord[];
  entity_roles: ExportRecord[];
  chronology: ExportRecord[];
  relationships: ExportRecord[];
  verification_records: ExportRecord[];
  state_transitions: ExportRecord[];
  patterns: ExportRecord[];
  cascades: ExportRecord[];
  claim_candidates: ExportRecord[];
  layer_receipts: ExportRecord[];
};

export class ExportRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ExportRequestError";
  }
}

function asRecord(value: unknown): ExportRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ExportRecord)
    : {};
}

function asRecords(value: unknown): ExportRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeCase(caseData: unknown, caseId: number): ExportRecord {
  const row = asRecord(caseData);
  return {
    id: caseId,
    name: row.name ?? "Untitled case",
    description: row.description ?? null,
    status: row.status ?? null,
    domain: row.domain ?? null,
    container: row.container ?? null,
    pipeline_type: row.pipelineType ?? row.pipeline_type ?? null,
    created_at: row.createdAt ?? row.created_at ?? null,
    updated_at: row.updatedAt ?? row.updated_at ?? null,
  };
}

function safeDocument(
  value: unknown,
  includeTextContent: boolean,
): ExportRecord {
  const row = asRecord(value);
  return {
    id: row.id ?? null,
    case_id: row.caseId ?? row.case_id ?? null,
    filename: row.filename ?? null,
    file_type: row.fileType ?? row.file_type ?? null,
    mime_type: row.mimeType ?? row.mime_type ?? null,
    file_size: row.fileSize ?? row.file_size ?? null,
    sha256_hash: row.sha256Hash ?? row.sha256_hash ?? null,
    status: row.status ?? null,
    page_count: row.pageCount ?? row.page_count ?? null,
    duration_seconds: row.durationSeconds ?? row.duration_seconds ?? null,
    document_type: row.documentType ?? row.document_type ?? null,
    document_purpose: row.documentPurpose ?? row.document_purpose ?? null,
    snapshot_id: row.snapshotId ?? row.snapshot_id ?? null,
    document_resolution:
      row.documentResolution ?? row.document_resolution ?? null,
    replaced_by_document_id:
      row.replacedByDocumentId ?? row.replaced_by_document_id ?? null,
    resolution_reason: row.resolutionReason ?? row.resolution_reason ?? null,
    created_at: row.createdAt ?? row.created_at ?? null,
    ...(includeTextContent
      ? { text_content: row.textContent ?? row.text_content ?? null }
      : {}),
  };
}

function safeSnapshot(value: unknown): ExportRecord | null {
  if (!value) return null;
  const row = asRecord(value);
  return {
    id: row.id ?? null,
    case_id: row.caseId ?? row.case_id ?? null,
    version: row.version ?? null,
    engine_version: row.engineVersion ?? row.engine_version ?? null,
    document_ids: row.documentIds ?? row.document_ids ?? [],
    document_hashes: row.documentHashes ?? row.document_hashes ?? {},
    status: row.status ?? row.snapshotStatus ?? row.snapshot_status ?? null,
    created_at: row.createdAt ?? row.created_at ?? null,
    sealed_at: row.sealedAt ?? row.sealed_at ?? null,
    signature_algorithm:
      row.signatureAlgorithm ?? row.signature_algorithm ?? null,
    public_key_fingerprint:
      row.publicKeyFingerprint ?? row.public_key_fingerprint ?? null,
  };
}

function matchesSnapshot(row: ExportRecord, snapshotId: number): boolean {
  if (snapshotId === 0) return true;
  const rowSnapshot = asPositiveInteger(row.snapshotId ?? row.snapshot_id);
  // Receipt-bound Intake projections do not carry the retired integer snapshot
  // foreign key. Keep those current projections while filtering legacy rows
  // that do declare a different snapshot identity.
  return rowSnapshot === null || rowSnapshot === snapshotId;
}

function governedRelationshipEvidence(
  relationship: ExportRecord,
  governedSourceDocumentIds: Set<number>,
): ExportRecord[] {
  return asRecords(
    relationship.backingEvidence ??
      relationship.backing_evidence ??
      relationship.evidence,
  ).filter((evidence) => {
    const documentId = asPositiveInteger(
      evidence.documentId ?? evidence.document_id,
    );
    return documentId !== null && governedSourceDocumentIds.has(documentId);
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function recomputeVerificationRecords(
  rows: ExportRecord[],
  governedArtifactKeys: Set<string>,
): ExportRecord[] {
  return rows.flatMap((row) => {
    const sourceRefs = asRecords(row.source_refs).filter((ref) =>
      governedArtifactKeys.has(String(ref.artifact_key ?? "")),
    );
    if (sourceRefs.length === 0) return [];

    const valuesByArtifact = new Map<string, Set<string>>();
    for (const ref of sourceRefs) {
      const artifactKey = String(ref.artifact_key);
      const values = valuesByArtifact.get(artifactKey) ?? new Set<string>();
      values.add(String(ref.value_stated ?? ""));
      valuesByArtifact.set(artifactKey, values);
    }

    const originalContradictions = asRecords(row.contradiction_refs);
    const attribute = String(
      originalContradictions[0]?.attribute ??
        String(row.fact_key ?? "").split("|")[1] ??
        "unknown",
    );
    const contradictionRefs: ExportRecord[] = [];
    const artifacts = [...valuesByArtifact.keys()].sort();
    for (let i = 0; i < artifacts.length; i += 1) {
      for (let j = i + 1; j < artifacts.length; j += 1) {
        for (const valueA of [
          ...(valuesByArtifact.get(artifacts[i]) ?? []),
        ].sort()) {
          for (const valueB of [
            ...(valuesByArtifact.get(artifacts[j]) ?? []),
          ].sort()) {
            if (valueA === valueB) continue;
            contradictionRefs.push({
              artifact_key_a: artifacts[i],
              value_a: valueA,
              artifact_key_b: artifacts[j],
              value_b: valueB,
              attribute,
            });
          }
        }
      }
    }

    const allValues = new Set(
      sourceRefs.map((ref) => String(ref.value_stated ?? "")),
    );
    const sameSourceConflict = [...valuesByArtifact.values()].some(
      (values) => values.size > 1,
    );
    const verificationState =
      contradictionRefs.length > 0
        ? "contradicted"
        : sameSourceConflict || allValues.size > 1
          ? "disputed"
          : valuesByArtifact.size >= 2
            ? "supported_by_multiple_sources"
            : "document_stated";

    return [
      {
        ...row,
        verification_state: verificationState,
        source_refs: sourceRefs,
        contradiction_refs: contradictionRefs,
      },
    ];
  });
}

function sourceBoundRegistryRows(
  rows: ExportRecord[],
  governedArtifactKeys: Set<string>,
): ExportRecord[] {
  return rows.filter((row) => {
    const sourceArtifacts = stringArray(row.source_artifacts);
    return (
      sourceArtifacts.length > 0 &&
      sourceArtifacts.every((key) => governedArtifactKeys.has(key))
    );
  });
}

function recordIdentitySet(
  rows: ExportRecord[],
  fields: string[],
): Set<string> {
  return new Set(
    rows.flatMap((row) => {
      for (const field of fields) {
        if (typeof row[field] === "string" && row[field].length > 0) {
          return [String(row[field])];
        }
      }
      return [];
    }),
  );
}

function governedClaimCandidates(
  rows: ExportRecord[],
  governedRelationshipIds: Set<string>,
  governedTransitionIds: Set<string>,
  governedPatternIds: Set<string>,
): ExportRecord[] {
  return rows.filter((row) => {
    const relationshipIds = stringArray(row.triggering_relationship_ids);
    const transitionIds = stringArray(row.triggering_transition_ids);
    const patternIds = stringArray(row.triggering_pattern_ids);
    return (
      relationshipIds.length > 0 &&
      relationshipIds.every((id) => governedRelationshipIds.has(id)) &&
      transitionIds.every((id) => governedTransitionIds.has(id)) &&
      patternIds.every((id) => governedPatternIds.has(id))
    );
  });
}

function governedSummary(
  stats: unknown,
  counts: {
    sources: number;
    entities: number;
    chronology: number;
    relationships: number;
    verification: number;
    claims: number;
    patterns: number;
    cascades: number;
  },
): ExportRecord {
  const summary = asRecord(stats);
  const derivedIntake = asRecord(summary.derivedIntake);
  const structuralSignals = counts.patterns + counts.cascades;
  return {
    ...summary,
    documents: counts.sources,
    entities: counts.entities,
    claims: counts.claims,
    findings: counts.verification,
    events: counts.chronology,
    relationships: counts.relationships,
    signalFlags: structuralSignals,
    verificationRecords: counts.verification,
    claimCandidates: counts.claims,
    derivedIntake: {
      ...derivedIntake,
      registeredSources: counts.sources,
      entities: counts.entities,
      events: counts.chronology,
      relationships: counts.relationships,
      verificationRecords: counts.verification,
      claimCandidates: counts.claims,
      structuralSignals,
    },
    documentStatus: { preserved: counts.sources },
  };
}

async function loadLayer(
  caseId: number,
  layerName: string,
): Promise<LayerProjection> {
  const projection = await read_canonical_case_layer_outputs<unknown>(
    caseId,
    layerName,
  );
  const currentOutputs = projection.outputs.filter(
    (output) => output.projection_current,
  );
  const rows = currentOutputs.flatMap((output) =>
    (Array.isArray(output.data) ? output.data : []).map((item) => ({
      ...asRecord(item),
      _receipt: {
        intake_session_id: output.intake_session_id,
        layer_run_id: output.layer_run_id,
        layer_name: output.layer_name,
        layer_version: output.layer_version,
        rule_version: output.rule_version,
        parser_version: output.parser_version,
        output_hash: output.output_hash,
        receipt_hash: output.receipt_hash,
        projection_current: output.projection_current,
      },
    })),
  );
  return {
    state: currentOutputs.length > 0 ? "canonical_projection" : "not_projected",
    rows,
    receipts: currentOutputs.map((output) => ({
      intake_session_id: output.intake_session_id,
      layer_run_id: output.layer_run_id,
      layer_name: output.layer_name,
      layer_version: output.layer_version,
      rule_version: output.rule_version,
      parser_version: output.parser_version,
      input_hash: output.input_hash,
      output_hash: output.output_hash,
      receipt_hash: output.receipt_hash,
      completed_at: output.completed_at,
      unresolved_dependencies: output.unresolved_dependencies,
      projection_current: output.projection_current,
    })),
  };
}

async function validateSnapshot(
  caseId: number,
  snapshotId: number,
): Promise<ExportRecord | null> {
  if (snapshotId === 0) return null;
  const snapshot = await dbHelpers.getSnapshot(snapshotId);
  if (!snapshot || Number(snapshot.caseId) !== caseId) {
    throw new ExportRequestError("Snapshot not found for this case", 404);
  }
  return asRecord(snapshot);
}

export async function loadCurrentCaseExportData(
  caseData: unknown,
  caseId: number,
  options: { includeTextContent?: boolean; snapshotId?: number } = {},
): Promise<CurrentCaseExportData> {
  const requestedSnapshotId = options.snapshotId ?? 0;
  const selectedSnapshot = await validateSnapshot(caseId, requestedSnapshotId);

  const [
    documentRows,
    integrity,
    entityRows,
    chronologyRows,
    relationshipRows,
    stats,
    latestSnapshot,
    verification,
    states,
    patterns,
    cascades,
    claims,
  ] = await Promise.all([
    dbHelpers.listDocuments(caseId),
    read_case_intake_integrity_projection(caseId),
    dbHelpers.listEntities(caseId),
    dbHelpers.listEvents(caseId),
    dbHelpers.listRelationshipsEnriched(caseId),
    dbHelpers.getCaseStats(caseId),
    selectedSnapshot
      ? Promise.resolve(selectedSnapshot)
      : dbHelpers.getLatestSnapshot(caseId),
    loadLayer(caseId, "verification_gate"),
    loadLayer(caseId, "state_timeline"),
    loadLayer(caseId, "pattern_registry"),
    loadLayer(caseId, "cascade_registry"),
    loadLayer(caseId, "rights_and_duties_matrix"),
  ]);

  const governedDocumentIds = new Set(
    integrity.artifacts.flatMap((artifact) =>
      artifact.integrity_status === "preserved" &&
      artifact.legacy_document_id !== null
        ? [artifact.legacy_document_id]
        : [],
    ),
  );
  const sources = asRecords(documentRows)
    .map((row) => safeDocument(row, options.includeTextContent === true))
    .filter(
      (row) =>
        governedDocumentIds.has(Number(row.id)) &&
        matchesSnapshot(row, requestedSnapshotId),
    );
  const governedSourceDocumentIds = new Set(
    sources.flatMap((source) => {
      const documentId = asPositiveInteger(source.id);
      return documentId === null ? [] : [documentId];
    }),
  );
  const governedArtifactKeys = new Set(
    integrity.artifacts.flatMap((artifact) =>
      artifact.integrity_status === "preserved" &&
      artifact.legacy_document_id !== null &&
      governedSourceDocumentIds.has(artifact.legacy_document_id)
        ? [artifact.artifact_key]
        : [],
    ),
  );
  const snapshotEntities = asRecords(entityRows).filter((row) =>
    matchesSnapshot(row, requestedSnapshotId),
  );
  const chronology = asRecords(chronologyRows).filter((row) => {
    const documentId = asPositiveInteger(row.documentId ?? row.document_id);
    return (
      matchesSnapshot(row, requestedSnapshotId) &&
      documentId !== null &&
      governedSourceDocumentIds.has(documentId)
    );
  });
  const relationships = asRecords(relationshipRows).flatMap((row) => {
    if (!matchesSnapshot(row, requestedSnapshotId)) return [];
    const evidence = governedRelationshipEvidence(
      row,
      governedSourceDocumentIds,
    );
    return evidence.length > 0
      ? [{ ...row, evidence, backingEvidence: evidence }]
      : [];
  });

  const roleGroups = await Promise.all(
    sources.flatMap((source) => {
      const documentId = asPositiveInteger(source.id);
      return documentId === null
        ? []
        : [dbHelpers.getGovernedEntityRolesForDocument(caseId, documentId)];
    }),
  );
  const entityRoles = roleGroups.flatMap((group) => asRecords(group));
  const governedEntityIds = new Set(
    entityRoles.map((role) => String(role.entityId ?? role.entity_id ?? "")),
  );
  const entities = snapshotEntities.filter((entity) =>
    governedEntityIds.has(String(entity.id ?? "")),
  );

  const layerReceipts = [verification, states, patterns, cascades, claims]
    .flatMap((layer) => layer.receipts)
    .sort(
      (left, right) =>
        String(left.layer_name ?? "").localeCompare(
          String(right.layer_name ?? ""),
        ) ||
        String(left.intake_session_id ?? "").localeCompare(
          String(right.intake_session_id ?? ""),
        ),
    );
  const stateTransitions = states.rows.filter((transition) =>
    governedArtifactKeys.has(
      String(
        transition.source_artifact_key ??
          transition.canonical_source_artifact_key ??
          "",
      ),
    ),
  );
  const verificationRecords = recomputeVerificationRecords(
    verification.rows,
    governedArtifactKeys,
  );
  const governedTransitionIds = recordIdentitySet(stateTransitions, [
    "transition_id",
  ]);
  const governedRelationshipIds = recordIdentitySet(relationships, [
    "canonical_relationship_id",
    "canonicalRelationshipId",
    "relationship_id",
    "id",
  ]);
  const governedPatterns = sourceBoundRegistryRows(
    patterns.rows,
    governedArtifactKeys,
  ).filter((pattern) =>
    asRecords(pattern.matching_transitions).every((transition) =>
      governedTransitionIds.has(String(transition.transition_id ?? "")),
    ),
  );
  const governedPatternIds = recordIdentitySet(governedPatterns, [
    "pattern_id",
  ]);
  const governedCascades = sourceBoundRegistryRows(
    cascades.rows,
    governedArtifactKeys,
  ).filter((cascade) =>
    asRecords(cascade.transitions_in_chain).every((transition) =>
      governedTransitionIds.has(String(transition.transition_id ?? "")),
    ),
  );
  const claimCandidates = governedClaimCandidates(
    claims.rows,
    governedRelationshipIds,
    governedTransitionIds,
    governedPatternIds,
  );
  const summary = governedSummary(stats, {
    sources: sources.length,
    entities: entities.length,
    chronology: chronology.length,
    relationships: relationships.length,
    verification: verificationRecords.length,
    claims: claimCandidates.length,
    patterns: governedPatterns.length,
    cascades: governedCascades.length,
  });

  return {
    export_contract: CURRENT_EXPORT_CONTRACT,
    generated_at: new Date().toISOString(),
    projection_scope: {
      authority: "sealed_current_universal_intake_projection",
      case_id: caseId,
      requested_snapshot_id: requestedSnapshotId || null,
      snapshot_filter_policy: requestedSnapshotId
        ? "matching legacy snapshot rows plus receipt-bound current projections"
        : "all rows in the current governed case projection",
      source_filter_policy:
        "active linked source artifacts with sealed preserved integrity",
      derived_source_filter_policy:
        "all derived projections require governed source bindings; dependent verification states are recomputed",
      relationship_filter_policy:
        "at least one backing-evidence row bound to a governed source",
      reviewer_commitment_boundary:
        "Derived records are not reviewer-committed findings.",
      source_storage_fields_excluded: ["s3_key", "s3_url"],
    },
    case: safeCase(caseData, caseId),
    snapshot: safeSnapshot(latestSnapshot),
    summary,
    sources,
    entities,
    entity_roles: entityRoles,
    chronology,
    relationships,
    verification_records: verificationRecords,
    state_transitions: stateTransitions,
    patterns: governedPatterns,
    cascades: governedCascades,
    claim_candidates: claimCandidates,
    layer_receipts: layerReceipts,
  };
}

function exportFilename(caseName: unknown, suffix: string): string {
  const safeCaseName =
    String(caseName ?? "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/^_+|_+$/g, "") || "Case";
  return `Luminari_${safeCaseName}_${suffix}`;
}

export function setExportDownloadHeaders(
  res: Response,
  exportType: SovereignExportType,
  caseName: unknown,
): void {
  const isJson = exportType === "json-dump";
  res.setHeader(
    "Content-Type",
    isJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${exportFilename(caseName, isJson ? "Data.json" : "Bundle.html")}"`,
  );
  res.setHeader(EXPORT_TYPE_HEADER, exportType);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function clearExportDownloadHeaders(res: Response): void {
  res.removeHeader("Content-Disposition");
  res.removeHeader(EXPORT_TYPE_HEADER);
  res.removeHeader("Content-Type");
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

async function writeResponseChunk(res: Response, chunk: string): Promise<void> {
  if (res.write(chunk) === false) await waitForResponseDrain(res);
}

function waitForResponseDrain(res: Response): Promise<void> {
  if (res.destroyed || res.writableEnded) {
    return Promise.reject(
      new Error("Export response closed before buffered data drained"),
    );
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      res.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Export response closed before buffered data drained"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    res.once("drain", onDrain);
    res.once("close", onClose);
    res.once("error", onError);
    // Close can race the listener registration after write() returns false.
    if (res.destroyed || res.writableEnded) onClose();
  });
}

async function writeJsonValue(res: Response, value: unknown): Promise<void> {
  if (!Array.isArray(value)) {
    await writeResponseChunk(res, jsonStringify(value));
    return;
  }

  await writeResponseChunk(res, "[");
  for (let index = 0; index < value.length; index++) {
    if (index > 0) await writeResponseChunk(res, ",");
    // Serialize one row at a time. The governed projection is already resident
    // in memory, but exports must not allocate a second whole-array JSON copy.
    await writeResponseChunk(res, jsonStringify(value[index]));
  }
  await writeResponseChunk(res, "]");
}

async function writeJsonObject(
  res: Response,
  data: CurrentCaseExportData,
): Promise<void> {
  await writeResponseChunk(res, "{");
  let first = true;
  for (const [key, value] of Object.entries(data)) {
    await writeResponseChunk(res, `${first ? "" : ","}${jsonStringify(key)}:`);
    await writeJsonValue(res, value);
    first = false;
  }
  res.end("}\n");
}

export async function streamJsonExport(
  res: Response,
  caseData: unknown,
  caseId: number,
  options: { includeTextContent?: boolean; snapshotId?: number } = {},
): Promise<void> {
  setExportDownloadHeaders(res, "json-dump", asRecord(caseData).name);
  const data = await loadCurrentCaseExportData(caseData, caseId, options);
  await writeJsonObject(res, data);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Not stated";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return jsonStringify(value);
}

function shortHash(value: unknown): string {
  const text = String(value ?? "");
  return text.length > 20 ? `${text.slice(0, 12)}…${text.slice(-6)}` : text;
}

const reportStyles = `
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0 auto; padding: 32px; max-width: 1100px; color: #182230; background: #f6f8fb; line-height: 1.45; }
  h1, h2, h3 { color: #0b1729; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  h2 { margin: 0; font-size: 18px; }
  h3 { margin: 0 0 6px; font-size: 14px; }
  p { margin: 5px 0; }
  .muted { color: #64748b; font-size: 12px; }
  .notice { margin: 20px 0; padding: 14px 16px; border-left: 4px solid #0ea5e9; background: #eaf8ff; }
  .counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px; margin: 20px 0; }
  .count { padding: 14px; background: white; border: 1px solid #dbe3ee; border-radius: 10px; }
  .count strong { display: block; font-size: 22px; }
  details { margin: 14px 0; background: white; border: 1px solid #dbe3ee; border-radius: 10px; overflow: hidden; }
  summary { cursor: pointer; padding: 15px 18px; font-weight: 700; background: #f9fbfd; }
  .section-body { padding: 16px 18px; }
  .card { padding: 13px; margin: 9px 0; border: 1px solid #e5eaf1; border-radius: 8px; break-inside: avoid; }
  .source { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #dbe3ee; color: #475569; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .badge { display: inline-block; margin: 2px 5px 2px 0; padding: 2px 7px; border-radius: 999px; background: #e8eef7; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 9px; border-bottom: 1px solid #e5eaf1; text-align: left; vertical-align: top; }
  th { background: #f5f8fc; }
  #search { width: 100%; padding: 11px 13px; margin: 8px 0 14px; border: 1px solid #cbd5e1; border-radius: 8px; }
  .print { position: fixed; top: 18px; right: 18px; padding: 9px 14px; color: white; background: #0b1729; border: 0; border-radius: 7px; cursor: pointer; }
  footer { margin-top: 30px; color: #64748b; font-size: 11px; }
  @media print { body { padding: 10px; background: white; } .print, #search { display: none; } details { break-inside: avoid; } details > * { display: block; } }
`;

function sourceLine(row: ExportRecord): string {
  const source =
    row.documentFilename ??
    row.document_filename ??
    row.canonical_source_artifact_key ??
    row.source_artifact_key ??
    row.artifact_key ??
    "source not bound";
  const offset =
    row.canonical_source_span_offset ??
    row.source_span_offset ??
    row.span_offset ??
    row.canonical_marker_offset ??
    null;
  return `${escapeHtml(source)}${offset === null ? "" : ` · offset ${escapeHtml(offset)}`}`;
}

function renderSources(data: CurrentCaseExportData, open = false): string {
  const rows = data.sources
    .map(
      (source) => `
    <tr data-searchable>
      <td>${escapeHtml(source.filename)}</td>
      <td>${escapeHtml(source.document_type ?? source.file_type)}</td>
      <td>${escapeHtml(source.status)}</td>
      <td>${escapeHtml(source.page_count)}</td>
      <td><code>${escapeHtml(shortHash(source.sha256_hash))}</code></td>
    </tr>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>Source register (${data.sources.length})</summary><div class="section-body">
    ${rows ? `<table><thead><tr><th>File</th><th>Type</th><th>Status</th><th>Pages</th><th>SHA-256</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No governed sources projected.</p>'}
  </div></details>`;
}

function renderChronology(data: CurrentCaseExportData, open = false): string {
  const rows = data.chronology
    .map(
      (event) => `
    <article class="card" data-searchable>
      <h3>${escapeHtml(event.title ?? event.event_text ?? "Source document event")}</h3>
      <span class="badge">${escapeHtml(event.dateOccurred ?? event.date ?? "date unresolved")}</span>
      <span class="badge">${escapeHtml(event.canonical_date_precision ?? "precision unresolved")}</span>
      ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
      <div class="source">${sourceLine(event)}</div>
    </article>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>Source-bound chronology (${data.chronology.length})</summary><div class="section-body">
    ${rows || '<p class="muted">No current chronology projection.</p>'}
  </div></details>`;
}

function renderEntities(data: CurrentCaseExportData, open = false): string {
  const rows = data.entities
    .map(
      (entity) => `
    <tr data-searchable>
      <td>${escapeHtml(entity.name)}</td>
      <td>${escapeHtml(entity.type)}</td>
      <td>${escapeHtml(entity.description)}</td>
      <td><code>${escapeHtml(shortHash(entity.canonical_entity_id ?? entity.id))}</code></td>
    </tr>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>Canonical entities (${data.entities.length})</summary><div class="section-body">
    ${rows ? `<table><thead><tr><th>Name</th><th>Type</th><th>Description</th><th>Canonical ID</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No current entity projection.</p>'}
  </div></details>`;
}

function renderRelationships(
  data: CurrentCaseExportData,
  open = false,
): string {
  const entityNames = new Map(
    data.entities.map((entity) => [
      String(entity.id),
      String(entity.name ?? entity.id),
    ]),
  );
  const rows = data.relationships
    .map((relationship) => {
      const evidence = asRecords(
        relationship.backingEvidence ?? relationship.evidence,
      );
      const evidenceHtml = evidence
        .map(
          (item) => `
      <div class="source">${escapeHtml(item.quoteText ?? item.explanation ?? "Explicit source marker")}<br>${sourceLine(item)}</div>`,
        )
        .join("");
      return `<article class="card" data-searchable>
      <h3>${escapeHtml(entityNames.get(String(relationship.sourceEntityId)) ?? relationship.sourceEntityId)}
        → ${escapeHtml(entityNames.get(String(relationship.targetEntityId)) ?? relationship.targetEntityId)}</h3>
      <span class="badge">${escapeHtml(relationship.relationshipType)}</span>
      <p>${escapeHtml(relationship.description)}</p>
      ${evidenceHtml || '<p class="muted">No source span was bound to this edge.</p>'}
    </article>`;
    })
    .join("");
  return `<details ${open ? "open" : ""}><summary>Explicit relationship graph (${data.relationships.length})</summary><div class="section-body">
    ${rows || '<p class="muted">No relationship survived the current source-bound quality gate.</p>'}
  </div></details>`;
}

function renderVerification(data: CurrentCaseExportData, open = false): string {
  const rows = data.verification_records
    .map((record) => {
      const refs = asRecords(record.source_refs)
        .map(
          (ref) =>
            `<div class="source">${sourceLine(ref)} · ${escapeHtml(ref.value_stated)}</div>`,
        )
        .join("");
      return `<article class="card" data-searchable>
      <h3>${escapeHtml(record.fact_key)}</h3>
      <span class="badge">${escapeHtml(record.verification_state)}</span>
      ${refs}
    </article>`;
    })
    .join("");
  return `<details ${open ? "open" : ""}><summary>Derived verification records (${data.verification_records.length})</summary><div class="section-body">
    <p class="muted">These are deterministic verification outputs, not reviewer-committed findings.</p>
    ${rows || '<p class="muted">No current verification records.</p>'}
  </div></details>`;
}

function renderStateTransitions(
  data: CurrentCaseExportData,
  open = false,
): string {
  const rows = data.state_transitions
    .map(
      (transition) => `
    <article class="card" data-searchable>
      <h3>${escapeHtml(transition.to_state)}</h3>
      <span class="badge">${escapeHtml(transition.transition_date ?? "date unresolved")}</span>
      <span class="badge">${escapeHtml(transition.verification_status)}</span>
      <p>${escapeHtml(transition.source_text)}</p>
      <div class="source">${sourceLine(transition)}</div>
    </article>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>State-transition candidates (${data.state_transitions.length})</summary><div class="section-body">
    ${rows || '<p class="muted">No state transition survived the current quality gate.</p>'}
  </div></details>`;
}

function renderCandidates(data: CurrentCaseExportData, open = false): string {
  const rows = data.claim_candidates
    .map(
      (candidate) => `
    <article class="card" data-searchable>
      <h3>${escapeHtml(candidate.claim_type_name ?? candidate.claim_type_id)}</h3>
      <span class="badge">candidate · unverified</span>
      <span class="badge">${escapeHtml(candidate.claim_domain)}</span>
      <p><strong>Matching rule:</strong> ${escapeHtml(candidate.matching_rule)}</p>
      <p><strong>Unresolved elements:</strong> ${escapeHtml(displayValue(candidate.unresolved_elements))}</p>
    </article>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>Unverified claim candidates (${data.claim_candidates.length})</summary><div class="section-body">
    <p class="muted">Candidates are routing aids. They are not findings, conclusions, or legal advice.</p>
    ${rows || '<p class="muted">No current claim candidates.</p>'}
  </div></details>`;
}

function renderReceipts(data: CurrentCaseExportData, open = false): string {
  const rows = data.layer_receipts
    .map(
      (receipt) => `
    <tr data-searchable>
      <td>${escapeHtml(receipt.layer_name)}</td>
      <td>${escapeHtml(receipt.layer_version)}</td>
      <td>${escapeHtml(receipt.projection_current)}</td>
      <td><code>${escapeHtml(shortHash(receipt.output_hash))}</code></td>
      <td><code>${escapeHtml(shortHash(receipt.receipt_hash))}</code></td>
    </tr>`,
    )
    .join("");
  return `<details ${open ? "open" : ""}><summary>Layer provenance receipts (${data.layer_receipts.length})</summary><div class="section-body">
    ${rows ? `<table><thead><tr><th>Layer</th><th>Version</th><th>Current</th><th>Output hash</th><th>Receipt hash</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No canonical layer receipts projected.</p>'}
  </div></details>`;
}

function renderCounts(data: CurrentCaseExportData): string {
  const items: Array<[string, number]> = [
    ["Sources", data.sources.length],
    ["Events", data.chronology.length],
    ["Entities", data.entities.length],
    ["Relationships", data.relationships.length],
    ["Verification records", data.verification_records.length],
    ["Claim candidates", data.claim_candidates.length],
  ];
  return `<div class="counts">${items.map(([label, value]) => `<div class="count"><strong>${value}</strong>${escapeHtml(label)}</div>`).join("")}</div>`;
}

function pageStart(
  data: CurrentCaseExportData,
  title: string,
  searchable: boolean,
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} — ${escapeHtml(data.case.name)}</title><style>${reportStyles}</style></head><body>
    <button class="print" type="button" onclick="window.print()">Print / Save PDF</button>
    <h1>${escapeHtml(title)}</h1>
    <p><strong>Case:</strong> ${escapeHtml(data.case.name)}</p>
    <p class="muted">Generated ${escapeHtml(data.generated_at)} · ${escapeHtml(data.export_contract)}</p>
    <div class="notice"><strong>Evidence posture:</strong> This report displays the sealed current Universal Intake projection. Machine-derived verification records, transitions, patterns, and claim candidates remain uncommitted until a reviewer acts.</div>
    ${renderCounts(data)}
    ${searchable ? '<input id="search" type="search" placeholder="Search this offline export" aria-label="Search this export">' : ""}`;
}

function pageEnd(searchable: boolean): string {
  return `<footer>Storage locations and private object keys are intentionally excluded. Source identity is carried by filenames, hashes, canonical artifact keys, offsets, output hashes, and receipt hashes.</footer>
    ${
      searchable
        ? `<script>
      const input = document.getElementById('search');
      input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        document.querySelectorAll('[data-searchable]').forEach(node => {
          const match = !query || node.textContent.toLowerCase().includes(query);
          node.style.display = match ? '' : 'none';
          if (match && query) node.closest('details')?.setAttribute('open', '');
        });
      });
    </script>`
        : ""
    }
  </body></html>`;
}

function page(
  data: CurrentCaseExportData,
  title: string,
  sections: string,
  searchable: boolean,
): string {
  return pageStart(data, title, searchable) + sections + pageEnd(searchable);
}

export function renderFullBundle(data: CurrentCaseExportData): string {
  return page(
    data,
    "Luminari governed evidence bundle",
    renderSources(data, true) +
      renderChronology(data) +
      renderEntities(data) +
      renderRelationships(data) +
      renderVerification(data) +
      renderStateTransitions(data) +
      renderCandidates(data) +
      renderReceipts(data),
    true,
  );
}

export function renderCaseReport(
  type: CaseReportType,
  data: CurrentCaseExportData,
): string {
  switch (type) {
    case "case-brief":
      return page(
        data,
        "Evidence review brief",
        renderSources(data, true) +
          renderVerification(data, true) +
          renderChronology(data, true) +
          renderCandidates(data, true),
        false,
      );
    case "entity-report":
      return page(
        data,
        "Canonical entity report",
        renderEntities(data, true) +
          renderRelationships(data, true) +
          renderReceipts(data, true),
        false,
      );
    case "timeline-report":
      return page(
        data,
        "Source-bound timeline report",
        renderChronology(data, true) +
          renderStateTransitions(data, true) +
          renderReceipts(data, true),
        false,
      );
    case "relationship-report":
      return page(
        data,
        "Explicit relationship report",
        renderRelationships(data, true) +
          renderEntities(data, true) +
          renderReceipts(data, true),
        false,
      );
  }
}

export async function streamHtmlBundle(
  res: Response,
  caseData: unknown,
  caseId: number,
): Promise<void> {
  setExportDownloadHeaders(res, "full-bundle", asRecord(caseData).name);
  const data = await loadCurrentCaseExportData(caseData, caseId);
  await writeResponseChunk(
    res,
    pageStart(data, "Luminari governed evidence bundle", true),
  );
  await writeResponseChunk(res, renderSources(data, true));
  await writeResponseChunk(res, renderChronology(data));
  await writeResponseChunk(res, renderEntities(data));
  await writeResponseChunk(res, renderRelationships(data));
  await writeResponseChunk(res, renderVerification(data));
  await writeResponseChunk(res, renderStateTransitions(data));
  await writeResponseChunk(res, renderCandidates(data));
  await writeResponseChunk(res, renderReceipts(data));
  await writeResponseChunk(res, pageEnd(true));
  res.end();
}
