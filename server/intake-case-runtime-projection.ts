import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

import { getPool } from "./db-legacy";
import { computeHash } from "./engines/intake-spine/utils";

const EXECUTION_CONTRACT_VERSION = "luminari.intake.layer-execution.v1";
const CANONICALIZATION_VERSION = "luminari.intake.canonical-json.v2";
const PROJECTION_BUCKET = 4_294_967_296n;
const MAX_CASE_ID = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / Number(PROJECTION_BUCKET)) - 1);

type ProjectionNamespace = "entity" | "relationship" | "entity_role" | "relationship_evidence";

type LayerOutputRow = {
  intake_session_id: string;
  link_type: string | null;
  is_primary: boolean | null;
  layer_run_id: string;
  layer_name: string;
  layer_version: string;
  rule_version: string;
  normalization_version: string | null;
  run_status: string;
  input_hash: string;
  output_hash: string;
  output_refs: unknown;
  unresolved_dependencies: unknown;
  receipt: any;
  receipt_hash: string | null;
  canonicalization_version: string | null;
  completed_at: string | Date | null;
  sealed_at: string | Date | null;
  output_artifact_id: string | null;
  output_artifact_key: string | null;
  output_artifact_type: string | null;
  output_artifact_status: string | null;
  output_artifact_metadata: any;
};

type SourceArtifactRow = {
  intake_session_id: string;
  artifact_id: string;
  artifact_key: string;
  filename: string | null;
  mime_type: string | null;
  metadata: any;
};

type CanonicalLayerOutput<T> = {
  intake_session_id: string;
  layer_run_id: string;
  layer_name: string;
  layer_version: string;
  rule_version: string;
  input_hash: string;
  output_hash: string;
  receipt_hash: string;
  completed_at: string | Date | null;
  unresolved_dependencies: any[];
  data: T;
};

type CanonicalEntityMention = {
  raw_text: string;
  artifact_key: string;
  span_offset: number;
};

type CanonicalEntity = {
  entity_id: string;
  type: string;
  canonical_name: string;
  raw_mentions: CanonicalEntityMention[];
  review_candidates?: any[];
};

type CanonicalRelationshipSourceRef = {
  artifact_key: string;
  span_start_offset: number;
  span_text: string;
  marker_text: string;
  marker_offset: number;
};

type CanonicalRelationship = {
  relationship_id: string;
  entity_a_id: string;
  entity_b_id: string;
  type: string;
  direction: "a_to_b" | "b_to_a" | "bidirectional";
  role_a: string;
  role_b: string;
  source_refs: CanonicalRelationshipSourceRef[];
};

export type CaseRuntimeProjectionState = "legacy_fallback" | "canonical_projection";

export type ProjectedEntity = {
  id: number;
  caseId: number;
  name: string;
  type: string;
  description: null;
  aliases: null;
  engineVersion: string;
  laneId: "universal_intake_spine";
  snapshotId: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  legacyRelationId: null;
  canonicalEntityId: string;
  canonicalOutputHashes: string[];
  canonicalReceiptHashes: string[];
  projectionSource: "universal_intake_spine";
};

export type ProjectedEntityRole = {
  id: number;
  entityId: number;
  documentId: number;
  role: "source_mention";
  quoteId: null;
  documentFilename: string | null;
  canonicalArtifactKey: string;
  canonicalSpanOffset: number;
  projectionSource: "universal_intake_spine";
};

export type ProjectedRelationshipEvidence = {
  id: number;
  explanation: string;
  quoteId: null;
  quoteText: string;
  pageNumber: null;
  statementOrigin: "source_span";
  documentId: number | null;
  documentFilename: string | null;
  canonicalArtifactKey: string;
  canonicalMarkerText: string;
  canonicalMarkerOffset: number;
  projectionSource: "universal_intake_spine";
};

export type ProjectedRelationship = {
  id: number;
  caseId: number;
  sourceEntityId: number;
  targetEntityId: number;
  relationshipType: string;
  description: string;
  evidenceCount: number;
  engineVersion: string;
  laneId: "universal_intake_spine";
  snapshotId: number | null;
  canonicalRelationshipId: string;
  canonicalOutputHashes: string[];
  canonicalReceiptHashes: string[];
  projectionSource: "universal_intake_spine";
  evidence: ProjectedRelationshipEvidence[];
  backingEvidence: ProjectedRelationshipEvidence[];
};

function projection_error(message: string, cause?: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Intake Spine projection integrity failure: ${message}`,
    cause,
  });
}

function stable_projection_id(case_id: number, namespace: ProjectionNamespace, canonical_id: string): number {
  if (!Number.isSafeInteger(case_id) || case_id <= 0) {
    projection_error(`invalid legacy case identity ${case_id}`);
  }
  if (BigInt(case_id) > MAX_CASE_ID) {
    projection_error(`legacy case identity ${case_id} exceeds deterministic projection range`);
  }
  if (!canonical_id || canonical_id.trim() === "") {
    projection_error(`missing ${namespace} canonical identity`);
  }

  const digest = createHash("sha256")
    .update(`${namespace}\u001f${canonical_id}`, "utf8")
    .digest();
  const suffix = BigInt(digest.readUInt32BE(0));
  const absolute = (BigInt(case_id) * PROJECTION_BUCKET) + suffix + 1n;
  const projected = -Number(absolute);
  if (!Number.isSafeInteger(projected)) {
    projection_error(`${namespace} projection identity exceeded JavaScript safe integer range`);
  }
  return projected;
}

export function is_intake_projection_id(id: number): boolean {
  return Number.isSafeInteger(id) && id < 0;
}

export function decode_intake_projection_case_id(id: number): number | null {
  if (!is_intake_projection_id(id)) return null;
  const absolute = BigInt(-id);
  if (absolute <= 0n) return null;
  const case_id = Number((absolute - 1n) / PROJECTION_BUCKET);
  return Number.isSafeInteger(case_id) && case_id > 0 ? case_id : null;
}

function as_json_array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function as_timestamp_ms(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sorted_unique<T>(values: T[], key: (value: T) => string): T[] {
  const by_key = new Map<string, T>();
  for (const value of values) by_key.set(key(value), value);
  return [...by_key.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

async function load_latest_case_layer_rows(case_id: number, layer_name: string): Promise<LayerOutputRow[]> {
  const result = await getPool().query(
    `with linked_sessions as (
       select cil.intake_session_id, cil.link_type, cil.is_primary
         from public.case_identity_bridge cib
         join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
        where cib.legacy_case_id = $1
     ), ranked as (
       select
         ls.link_type,
         ls.is_primary,
         lr.*,
         row_number() over (
           partition by lr.intake_session_id, lr.layer_name
           order by lr.sealed_at desc nulls last,
                    lr.completed_at desc nulls last,
                    lr.started_at desc nulls last,
                    lr.layer_run_id desc
         ) as projection_rank
       from linked_sessions ls
       join public.intake_layer_runs lr on lr.intake_session_id = ls.intake_session_id
       where lr.layer_name = $2
         and lr.run_status = 'completed'
         and lr.is_sealed = true
     )
     select
       r.intake_session_id,
       r.link_type,
       r.is_primary,
       r.layer_run_id,
       r.layer_name,
       r.layer_version,
       r.rule_version,
       r.normalization_version,
       r.run_status,
       r.input_hash,
       r.output_hash,
       r.output_refs,
       r.unresolved_dependencies,
       r.receipt,
       r.receipt_hash,
       r.canonicalization_version,
       r.completed_at,
       r.sealed_at,
       a.artifact_id::text as output_artifact_id,
       a.artifact_key as output_artifact_key,
       a.artifact_type as output_artifact_type,
       a.artifact_status as output_artifact_status,
       a.metadata as output_artifact_metadata
     from ranked r
     left join public.intake_artifacts a
       on a.artifact_id = case
         when coalesce(r.receipt ->> 'output_artifact_id', '') ~
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then (r.receipt ->> 'output_artifact_id')::uuid
         else null
       end
     where r.projection_rank = 1
     order by r.intake_session_id`,
    [case_id, layer_name],
  );
  return result.rows as LayerOutputRow[];
}

function row_is_projection_eligible(row: LayerOutputRow): boolean {
  return row.receipt?.receipt_type === "layer_execution"
    && row.receipt?.execution_contract_version === EXECUTION_CONTRACT_VERSION
    && row.canonicalization_version === CANONICALIZATION_VERSION;
}

function validate_projection_row<T>(row: LayerOutputRow): CanonicalLayerOutput<T> {
  const receipt = row.receipt ?? {};
  const metadata = row.output_artifact_metadata ?? {};
  const output_refs = as_json_array(row.output_refs);

  if (!row.receipt_hash || !/^[0-9a-f]{64}$/.test(row.receipt_hash)) {
    projection_error(`${row.layer_name} run ${row.layer_run_id} has no valid sealed receipt hash`);
  }
  if (!row.output_artifact_id || row.output_artifact_type !== "intake_layer_output") {
    projection_error(`${row.layer_name} run ${row.layer_run_id} is missing its canonical output artifact`);
  }
  if (row.output_artifact_status !== "preserved") {
    projection_error(`${row.layer_name} output ${row.output_artifact_id} is not preserved`);
  }
  if (receipt.output_artifact_id !== row.output_artifact_id) {
    projection_error(`${row.layer_name} receipt/output artifact identity mismatch`);
  }
  if (output_refs.length !== 1 || String(output_refs[0]?.artifact_id ?? "") !== row.output_artifact_id) {
    projection_error(`${row.layer_name} output_refs do not identify the sealed output artifact`);
  }
  if (metadata.execution_contract_version !== EXECUTION_CONTRACT_VERSION
      || metadata.canonicalization_version !== CANONICALIZATION_VERSION
      || metadata.layer_name !== row.layer_name
      || metadata.layer_version !== row.layer_version
      || metadata.rule_version !== row.rule_version
      || metadata.output_hash !== row.output_hash) {
    projection_error(`${row.layer_name} output artifact metadata differs from the sealed run contract`);
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, "data")) {
    projection_error(`${row.layer_name} output artifact does not contain canonical data`);
  }

  let recomputed_output_hash: string;
  try {
    recomputed_output_hash = computeHash(metadata.data);
  } catch (error) {
    projection_error(`${row.layer_name} output cannot be canonically hashed`, error);
  }
  if (recomputed_output_hash !== row.output_hash) {
    projection_error(`${row.layer_name} output hash does not match preserved canonical data`);
  }

  return {
    intake_session_id: row.intake_session_id,
    layer_run_id: row.layer_run_id,
    layer_name: row.layer_name,
    layer_version: row.layer_version,
    rule_version: row.rule_version,
    input_hash: row.input_hash,
    output_hash: row.output_hash,
    receipt_hash: row.receipt_hash,
    completed_at: row.completed_at,
    unresolved_dependencies: as_json_array(row.unresolved_dependencies),
    data: metadata.data as T,
  };
}

async function load_case_layer_outputs<T>(
  case_id: number,
  layer_name: string,
): Promise<{ state: CaseRuntimeProjectionState; outputs: CanonicalLayerOutput<T>[] }> {
  const latest_rows = await load_latest_case_layer_rows(case_id, layer_name);
  const eligible_rows = latest_rows.filter(row_is_projection_eligible);
  if (eligible_rows.length === 0) {
    return { state: "legacy_fallback", outputs: [] };
  }
  return {
    state: "canonical_projection",
    outputs: eligible_rows.map(validate_projection_row<T>),
  };
}

async function load_case_source_artifacts(case_id: number): Promise<SourceArtifactRow[]> {
  const result = await getPool().query(
    `select
       a.intake_session_id,
       a.artifact_id::text,
       a.artifact_key,
       a.filename,
       a.mime_type,
       a.metadata
     from public.case_identity_bridge cib
     join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
     join public.intake_artifacts a on a.intake_session_id = cil.intake_session_id
     where cib.legacy_case_id = $1
       and a.artifact_type = 'source_document'
       and a.artifact_status = 'preserved'
     order by a.artifact_key, a.artifact_id`,
    [case_id],
  );
  return result.rows as SourceArtifactRow[];
}

function source_artifact_index(rows: SourceArtifactRow[]) {
  const index = new Map<string, SourceArtifactRow[]>();
  for (const row of rows) {
    const list = index.get(row.artifact_key) ?? [];
    list.push(row);
    index.set(row.artifact_key, list);
  }
  for (const list of index.values()) {
    list.sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  }
  return index;
}

function unambiguous_source_binding(rows: SourceArtifactRow[] | undefined): {
  document_id: number | null;
  filename: string | null;
  snapshot_id: number | null;
} {
  if (!rows || rows.length === 0) return { document_id: null, filename: null, snapshot_id: null };
  const document_ids = [...new Set(rows
    .map(row => Number(row.metadata?.legacy_document_id))
    .filter(value => Number.isSafeInteger(value) && value > 0))];
  const filenames = [...new Set(rows.map(row => row.filename).filter(Boolean))] as string[];
  const snapshot_ids = [...new Set(rows
    .map(row => Number(row.metadata?.snapshot_id))
    .filter(value => Number.isSafeInteger(value) && value > 0))];
  return {
    document_id: document_ids.length === 1 ? document_ids[0] : null,
    filename: filenames.length === 1 ? filenames[0] : null,
    snapshot_id: snapshot_ids.length === 1 ? snapshot_ids[0] : null,
  };
}

function merge_canonical_entities(outputs: CanonicalLayerOutput<CanonicalEntity[]>[]): CanonicalEntity[] {
  const entity_map = new Map<string, CanonicalEntity>();
  for (const output of outputs) {
    if (!Array.isArray(output.data)) projection_error(`entity_registry output ${output.layer_run_id} is not an array`);
    for (const entity of output.data) {
      if (!entity || typeof entity.entity_id !== "string" || typeof entity.canonical_name !== "string") {
        projection_error(`entity_registry output ${output.layer_run_id} contains an invalid entity`);
      }
      const existing = entity_map.get(entity.entity_id);
      if (!existing) {
        entity_map.set(entity.entity_id, {
          ...entity,
          raw_mentions: [...(entity.raw_mentions ?? [])],
          review_candidates: [...(entity.review_candidates ?? [])],
        });
        continue;
      }
      if (existing.type !== entity.type || existing.canonical_name !== entity.canonical_name) {
        projection_error(`canonical entity ${entity.entity_id} changed meaning across linked Intake sessions`);
      }
      existing.raw_mentions.push(...(entity.raw_mentions ?? []));
      existing.review_candidates = [
        ...(existing.review_candidates ?? []),
        ...(entity.review_candidates ?? []),
      ];
    }
  }

  const entities = [...entity_map.values()];
  for (const entity of entities) {
    entity.raw_mentions = sorted_unique(
      entity.raw_mentions,
      mention => `${mention.artifact_key}\u001f${mention.span_offset}\u001f${mention.raw_text}`,
    );
    entity.review_candidates = sorted_unique(
      entity.review_candidates ?? [],
      candidate => `${candidate.candidate_entity_id}\u001f${candidate.similarity_type}\u001f${candidate.distance}`,
    );
  }
  return entities.sort((left, right) => left.entity_id.localeCompare(right.entity_id));
}

function assert_unique_projection_ids<T>(rows: T[], id_of: (row: T) => number, canonical_of: (row: T) => string) {
  const seen = new Map<number, string>();
  for (const row of rows) {
    const id = id_of(row);
    const canonical = canonical_of(row);
    const prior = seen.get(id);
    if (prior && prior !== canonical) {
      projection_error(`deterministic projection id collision between ${prior} and ${canonical}`);
    }
    seen.set(id, canonical);
  }
}

function preferred_entity_display_name(entity: CanonicalEntity): string {
  const mentions = [...(entity.raw_mentions ?? [])].sort((left, right) =>
    left.artifact_key.localeCompare(right.artifact_key)
      || left.span_offset - right.span_offset
      || left.raw_text.localeCompare(right.raw_text),
  );
  return mentions[0]?.raw_text?.trim() || entity.canonical_name;
}

function entity_snapshot_id(entity: CanonicalEntity, artifacts: Map<string, SourceArtifactRow[]>): number | null {
  const snapshot_ids = [...new Set(entity.raw_mentions
    .map(mention => unambiguous_source_binding(artifacts.get(mention.artifact_key)).snapshot_id)
    .filter((value): value is number => value !== null))];
  return snapshot_ids.length === 1 ? snapshot_ids[0] : null;
}

export async function project_case_entities(case_id: number): Promise<{
  state: CaseRuntimeProjectionState;
  entities: ProjectedEntity[];
  canonical_entities: CanonicalEntity[];
  source_artifacts: Map<string, SourceArtifactRow[]>;
}> {
  const layer = await load_case_layer_outputs<CanonicalEntity[]>(case_id, "entity_registry");
  if (layer.state === "legacy_fallback") {
    return {
      state: "legacy_fallback",
      entities: [],
      canonical_entities: [],
      source_artifacts: new Map(),
    };
  }

  const canonical_entities = merge_canonical_entities(layer.outputs);
  const source_artifacts = source_artifact_index(await load_case_source_artifacts(case_id));
  const output_hashes = [...new Set(layer.outputs.map(output => output.output_hash))].sort();
  const receipt_hashes = [...new Set(layer.outputs.map(output => output.receipt_hash))].sort();
  const latest_completed_at = layer.outputs
    .map(output => as_timestamp_ms(output.completed_at))
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0] ?? null;
  const layer_versions = [...new Set(layer.outputs.map(output => output.layer_version))].sort().join("|");

  const entities = canonical_entities.map(entity => ({
    id: stable_projection_id(case_id, "entity", entity.entity_id),
    caseId: case_id,
    name: preferred_entity_display_name(entity),
    type: entity.type,
    description: null,
    aliases: null,
    engineVersion: `intake-spine:${layer_versions}`,
    laneId: "universal_intake_spine" as const,
    snapshotId: entity_snapshot_id(entity, source_artifacts),
    createdAt: latest_completed_at,
    updatedAt: latest_completed_at,
    legacyRelationId: null,
    canonicalEntityId: entity.entity_id,
    canonicalOutputHashes: output_hashes,
    canonicalReceiptHashes: receipt_hashes,
    projectionSource: "universal_intake_spine" as const,
  }));
  assert_unique_projection_ids(entities, entity => entity.id, entity => entity.canonicalEntityId);
  entities.sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);

  return { state: "canonical_projection", entities, canonical_entities, source_artifacts };
}

export async function get_projected_entity(id: number): Promise<ProjectedEntity | null> {
  const case_id = decode_intake_projection_case_id(id);
  if (!case_id) return null;
  const projection = await project_case_entities(case_id);
  if (projection.state !== "canonical_projection") return null;
  return projection.entities.find(entity => entity.id === id) ?? null;
}

export async function get_projected_entity_roles(entity_id: number): Promise<ProjectedEntityRole[] | null> {
  const case_id = decode_intake_projection_case_id(entity_id);
  if (!case_id) return null;
  const projection = await project_case_entities(case_id);
  if (projection.state !== "canonical_projection") return null;
  const projected_entity = projection.entities.find(entity => entity.id === entity_id);
  if (!projected_entity) return [];
  const canonical_entity = projection.canonical_entities.find(
    entity => entity.entity_id === projected_entity.canonicalEntityId,
  );
  if (!canonical_entity) projection_error(`projected entity ${entity_id} lost canonical source identity`);

  const roles: ProjectedEntityRole[] = [];
  for (const mention of canonical_entity.raw_mentions) {
    const binding = unambiguous_source_binding(projection.source_artifacts.get(mention.artifact_key));
    if (!binding.document_id) continue;
    roles.push({
      id: stable_projection_id(
        case_id,
        "entity_role",
        `${canonical_entity.entity_id}\u001f${mention.artifact_key}\u001f${mention.span_offset}`,
      ),
      entityId: entity_id,
      documentId: binding.document_id,
      role: "source_mention",
      quoteId: null,
      documentFilename: binding.filename,
      canonicalArtifactKey: mention.artifact_key,
      canonicalSpanOffset: mention.span_offset,
      projectionSource: "universal_intake_spine",
    });
  }
  const unique = sorted_unique(roles, role => `${role.documentId}\u001f${role.canonicalArtifactKey}\u001f${role.canonicalSpanOffset}`);
  assert_unique_projection_ids(unique, role => role.id, role => `${role.canonicalArtifactKey}:${role.canonicalSpanOffset}`);
  return unique;
}

function merge_canonical_relationships(
  outputs: CanonicalLayerOutput<CanonicalRelationship[]>[],
): CanonicalRelationship[] {
  const relationship_map = new Map<string, CanonicalRelationship>();
  for (const output of outputs) {
    if (!Array.isArray(output.data)) projection_error(`relationship_graph output ${output.layer_run_id} is not an array`);
    for (const relationship of output.data) {
      if (!relationship || typeof relationship.relationship_id !== "string") {
        projection_error(`relationship_graph output ${output.layer_run_id} contains an invalid relationship`);
      }
      const existing = relationship_map.get(relationship.relationship_id);
      if (!existing) {
        relationship_map.set(relationship.relationship_id, {
          ...relationship,
          source_refs: [...(relationship.source_refs ?? [])],
        });
        continue;
      }
      const identity_fields = ["entity_a_id", "entity_b_id", "type", "direction", "role_a", "role_b"] as const;
      if (identity_fields.some(field => existing[field] !== relationship[field])) {
        projection_error(`canonical relationship ${relationship.relationship_id} changed meaning across linked Intake sessions`);
      }
      existing.source_refs.push(...(relationship.source_refs ?? []));
    }
  }
  const relationships = [...relationship_map.values()];
  for (const relationship of relationships) {
    relationship.source_refs = sorted_unique(
      relationship.source_refs,
      ref => `${ref.artifact_key}\u001f${ref.marker_offset}\u001f${ref.span_start_offset}\u001f${ref.marker_text}`,
    );
  }
  return relationships.sort((left, right) => left.relationship_id.localeCompare(right.relationship_id));
}

function relationship_description(relationship: CanonicalRelationship): string {
  if (relationship.direction === "a_to_b") return `${relationship.role_a} → ${relationship.role_b}`;
  if (relationship.direction === "b_to_a") return `${relationship.role_b} → ${relationship.role_a}`;
  return `${relationship.role_a} ↔ ${relationship.role_b}`;
}

function source_target_entity_ids(
  relationship: CanonicalRelationship,
  entity_ids: Map<string, number>,
): { source: number; target: number } {
  const a = entity_ids.get(relationship.entity_a_id);
  const b = entity_ids.get(relationship.entity_b_id);
  if (!a || !b) {
    projection_error(`relationship ${relationship.relationship_id} references an entity absent from the case entity projection`);
  }
  if (relationship.direction === "b_to_a") return { source: b, target: a };
  return { source: a, target: b };
}

function project_relationship_evidence(
  case_id: number,
  relationship: CanonicalRelationship,
  artifacts: Map<string, SourceArtifactRow[]>,
): ProjectedRelationshipEvidence[] {
  const evidence = relationship.source_refs.map(ref => {
    const binding = unambiguous_source_binding(artifacts.get(ref.artifact_key));
    return {
      id: stable_projection_id(
        case_id,
        "relationship_evidence",
        `${relationship.relationship_id}\u001f${ref.artifact_key}\u001f${ref.marker_offset}\u001f${ref.span_start_offset}`,
      ),
      explanation: `Explicit ${relationship.type} marker “${ref.marker_text}” in preserved source span.`,
      quoteId: null,
      quoteText: ref.span_text,
      pageNumber: null,
      statementOrigin: "source_span" as const,
      documentId: binding.document_id,
      documentFilename: binding.filename,
      canonicalArtifactKey: ref.artifact_key,
      canonicalMarkerText: ref.marker_text,
      canonicalMarkerOffset: ref.marker_offset,
      projectionSource: "universal_intake_spine" as const,
    };
  });
  const unique = sorted_unique(evidence, row => `${row.canonicalArtifactKey}\u001f${row.canonicalMarkerOffset}\u001f${row.quoteText}`);
  assert_unique_projection_ids(unique, row => row.id, row => `${row.canonicalArtifactKey}:${row.canonicalMarkerOffset}`);
  return unique;
}

export async function project_case_relationships(case_id: number): Promise<{
  state: CaseRuntimeProjectionState;
  relationships: ProjectedRelationship[];
}> {
  const relationship_layer = await load_case_layer_outputs<CanonicalRelationship[]>(case_id, "relationship_graph");
  if (relationship_layer.state === "legacy_fallback") {
    return { state: "legacy_fallback", relationships: [] };
  }

  const entity_projection = await project_case_entities(case_id);
  if (entity_projection.state !== "canonical_projection") {
    projection_error("relationship_graph is canonical but entity_registry has no canonical projection output");
  }
  const canonical_relationships = merge_canonical_relationships(relationship_layer.outputs);
  const entity_ids = new Map(
    entity_projection.entities.map(entity => [entity.canonicalEntityId, entity.id]),
  );
  const output_hashes = [...new Set(relationship_layer.outputs.map(output => output.output_hash))].sort();
  const receipt_hashes = [...new Set(relationship_layer.outputs.map(output => output.receipt_hash))].sort();
  const layer_versions = [...new Set(relationship_layer.outputs.map(output => output.layer_version))].sort().join("|");

  const relationships = canonical_relationships.map(relationship => {
    const endpoints = source_target_entity_ids(relationship, entity_ids);
    const evidence = project_relationship_evidence(case_id, relationship, entity_projection.source_artifacts);
    const snapshot_ids = [...new Set(evidence
      .map(row => unambiguous_source_binding(entity_projection.source_artifacts.get(row.canonicalArtifactKey)).snapshot_id)
      .filter((value): value is number => value !== null))];
    return {
      id: stable_projection_id(case_id, "relationship", relationship.relationship_id),
      caseId: case_id,
      sourceEntityId: endpoints.source,
      targetEntityId: endpoints.target,
      relationshipType: relationship.type,
      description: relationship_description(relationship),
      evidenceCount: evidence.length,
      engineVersion: `intake-spine:${layer_versions}`,
      laneId: "universal_intake_spine" as const,
      snapshotId: snapshot_ids.length === 1 ? snapshot_ids[0] : null,
      canonicalRelationshipId: relationship.relationship_id,
      canonicalOutputHashes: output_hashes,
      canonicalReceiptHashes: receipt_hashes,
      projectionSource: "universal_intake_spine" as const,
      evidence,
      backingEvidence: evidence,
    };
  });
  assert_unique_projection_ids(relationships, relationship => relationship.id, relationship => relationship.canonicalRelationshipId);
  relationships.sort((left, right) => left.canonicalRelationshipId.localeCompare(right.canonicalRelationshipId));
  return { state: "canonical_projection", relationships };
}

export async function get_projected_relationships_for_entity(
  entity_id: number,
): Promise<ProjectedRelationship[] | null> {
  const case_id = decode_intake_projection_case_id(entity_id);
  if (!case_id) return null;
  const projection = await project_case_relationships(case_id);
  if (projection.state !== "canonical_projection") return null;
  return projection.relationships.filter(
    relationship => relationship.sourceEntityId === entity_id || relationship.targetEntityId === entity_id,
  );
}

export async function get_projected_relationships_for_entity_enriched(
  entity_id: number,
): Promise<Array<ProjectedRelationship & { sourceEntityName: string | null; targetEntityName: string | null }> | null> {
  const case_id = decode_intake_projection_case_id(entity_id);
  if (!case_id) return null;
  const entity_projection = await project_case_entities(case_id);
  if (entity_projection.state !== "canonical_projection") return null;
  const relationship_projection = await project_case_relationships(case_id);
  if (relationship_projection.state !== "canonical_projection") return null;
  const names = new Map(entity_projection.entities.map(entity => [entity.id, entity.name]));
  return relationship_projection.relationships
    .filter(relationship => relationship.sourceEntityId === entity_id || relationship.targetEntityId === entity_id)
    .map(relationship => ({
      ...relationship,
      sourceEntityName: names.get(relationship.sourceEntityId) ?? null,
      targetEntityName: names.get(relationship.targetEntityId) ?? null,
    }));
}
