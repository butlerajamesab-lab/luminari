import { createHash, randomUUID } from 'node:crypto';
import { getPool } from './db';
import { register_intake_layer_execution } from './intake-layer-run-persistence';
import { load_governed_legal_registry } from './intake-governed-legal-registry';
import { read_intake_source_artifact_bytes } from './intake-source-bytes';
import {
  CANONICALIZATION_VERSION,
  computeExecutionHash,
  computeHash,
  EngineResult,
} from './engines/intake-spine/utils';
import { parseArtifact, PARSER_RULE_MANIFEST_HASH } from './engines/intake-spine/parsing-substrate';
import {
  processLayer1,
  RULE_MANIFEST_HASH as L1_RULE_HASH,
  StabilizationInput,
} from './engines/intake-spine/layer-1-stabilization_envelope';
import {
  processLayer2,
  RULE_MANIFEST_HASH as L2_RULE_HASH,
} from './engines/intake-spine/layer-2-raw_intake_capture';
import {
  processLayer3,
  RULE_MANIFEST_HASH as L3_RULE_HASH,
} from './engines/intake-spine/layer-3-evidence_preservation';
import {
  processLayer4,
  RULE_MANIFEST_HASH as L4_RULE_HASH,
} from './engines/intake-spine/layer-4-chronology_reconstruction';
import {
  processLayer5,
  RULE_MANIFEST_HASH as L5_RULE_HASH,
} from './engines/intake-spine/layer-5-verification_gate';
import {
  processLayer6,
  RULE_MANIFEST_HASH as L6_RULE_HASH,
} from './engines/intake-spine/layer-6-entity_registry';
import {
  processLayer7,
  RULE_MANIFEST_HASH as L7_RULE_HASH,
} from './engines/intake-spine/layer-7-relationship_graph';
import {
  processLayer8,
  RULE_MANIFEST_HASH as L8_RULE_HASH,
} from './engines/intake-spine/layer-8-power_dynamics_registry';
import {
  processLayer9,
  RULE_MANIFEST_HASH as L9_RULE_HASH,
} from './engines/intake-spine/layer-9-state_timeline';
import {
  processLayer10,
  RULE_MANIFEST_HASH as L10_RULE_HASH,
} from './engines/intake-spine/layer-10-pattern_registry';
import {
  processLayer11,
  RULE_MANIFEST_HASH as L11_RULE_HASH,
} from './engines/intake-spine/layer-11-cascade_registry';
import {
  processLayer12,
  computeLayer12ExecutionRuleManifestHash,
} from './engines/intake-spine/layer-12-rights_and_duties_matrix';
import {
  processLayer13,
  RULE_MANIFEST_HASH as L13_RULE_HASH,
} from './engines/intake-spine/layer-13-translation_layer';
import {
  processLayer14,
  computeLayer14ExecutionRuleManifestHash,
} from './engines/intake-spine/layer-14-action_paths';
import { assertDerivedSemanticQuality } from './engines/intake-spine/derived-semantic-quality';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export const INTAKE_SPINE_LAYER_NAMES = Object.freeze([
  'stabilization_envelope',
  'raw_intake_capture',
  'evidence_preservation',
  'chronology_reconstruction',
  'verification_gate',
  'entity_registry',
  'relationship_graph',
  'power_dynamics_registry',
  'state_timeline',
  'pattern_registry',
  'cascade_registry',
  'rights_and_duties_matrix',
  'translation_layer',
  'action_paths',
] as const);

export type intake_spine_orchestration_request = {
  intake_session_id: string;
  as_of: string;
  jurisdiction: string;
};

export type intake_spine_execution_receipt = {
  layer_name: string;
  layer_version: string;
  rule_version: string;
  parser_version: string;
  rule_manifest_hash: string;
  execution_input_hash: string;
  output_hash: string;
  layer_run_id: string;
  output_artifact_id: string;
  receipt_hash: string;
  reused_existing: boolean;
  unresolved_dependency_count: number;
};

export type intake_spine_orchestration_result = {
  intake_session_id: string;
  case_uuid: string | null;
  legacy_case_id: number | null;
  source_artifact_count: number;
  parsed_artifact_count: number;
  unsupported_or_failed_artifact_count: number;
  governed_legal_registry_hash: string;
  execution_order: string[];
  receipts: intake_spine_execution_receipt[];
  final_output_hashes: {
    chronology: string;
    verification: string;
    entities: string;
    relationships: string;
    power_dynamics: string;
    state_timeline: string;
    patterns: string;
    cascades: string;
    claim_candidates: string;
    translation: string;
    action_paths: string;
  };
};

type session_row = {
  intake_session_id: string;
  session_row_version: string;
  owner_user_id: number | null;
  session_type: string;
  entry_channel: string;
  source_label: string | null;
  privacy_mode: string;
  session_status: string;
  completion_state: string;
  user_selected_immediate_issue: string | null;
  metadata: Record<string, unknown>;
  case_uuid: string | null;
  legacy_case_id: number | null;
};

type source_artifact_row = {
  artifact_id: string;
  artifact_key: string;
  filename: string | null;
  mime_type: string | null;
  byte_size: string | number | null;
  sha256: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
  artifact_status: string;
  availability: string;
  metadata: Record<string, unknown>;
};

type persisted_dependency = {
  layer_name: string;
  layer_run_id: string;
  output_artifact_id: string;
  receipt_hash: string;
  output_hash: string;
};

type persist_layer_input<T> = {
  session_id: string;
  result: EngineResult<T>;
  rule_manifest_hash: string;
  canonical_input: Record<string, unknown>;
  input_refs: unknown[];
  receipts: intake_spine_execution_receipt[];
  dependencies: Map<string, persisted_dependency>;
  dependency_key?: string;
};

export async function finalize_intake_spine_session_if_unchanged(
  pool: Pick<ReturnType<typeof getPool>, 'query'>,
  input: {
    intake_session_id: string;
    session_row_version: string;
    jurisdiction: string;
    as_of: string;
    required_layer_count: number;
    sealed_receipt_count: number;
    execution_lease_token: string;
  },
): Promise<void> {
  const completion_result = await pool.query<{ completed: boolean }>(
    `select public.complete_intake_spine_execution_v1(
       $1::uuid,
       $2::text,
       $3::uuid,
       $4::text,
       $5::text,
       $6::integer,
       $7::integer
     ) as completed`,
    [
      input.intake_session_id,
      input.session_row_version,
      input.execution_lease_token,
      input.jurisdiction,
      input.as_of,
      input.required_layer_count,
      input.sealed_receipt_count,
    ],
  );
  if (completion_result.rows[0]?.completed !== true) {
    throw new Error(
      'intake_spine_orchestrator_session_changed_during_execution',
    );
  }
}

export type intake_spine_execution_lease = {
  lease_token: string;
  assert_active: () => void;
  release: () => Promise<void>;
};

const INTAKE_SPINE_EXECUTION_LEASE_SECONDS = 120;
const INTAKE_SPINE_EXECUTION_HEARTBEAT_MS = 30_000;

export async function acquire_intake_spine_execution_lease(
  pool: Pick<ReturnType<typeof getPool>, 'query'>,
  intake_session_id: string,
  options: {
    lease_token?: string;
    lease_seconds?: number;
    heartbeat_interval_ms?: number;
  } = {},
): Promise<intake_spine_execution_lease> {
  const lease_token = options.lease_token ?? randomUUID();
  const lease_seconds =
    options.lease_seconds ?? INTAKE_SPINE_EXECUTION_LEASE_SECONDS;
  const heartbeat_interval_ms =
    options.heartbeat_interval_ms ?? INTAKE_SPINE_EXECUTION_HEARTBEAT_MS;
  const acquisition_result = await pool.query<{ acquired: boolean }>(
    `select public.acquire_intake_spine_execution_lease_v1(
       $1::uuid,
       $2::uuid,
       $3::integer
     ) as acquired`,
    [intake_session_id, lease_token, lease_seconds],
  );
  if (acquisition_result.rows[0]?.acquired !== true) {
    throw new Error('intake_spine_orchestrator_execution_already_in_progress');
  }

  let active = true;
  let released = false;
  let heartbeat_in_flight = false;
  const heartbeat = async () => {
    if (!active || released || heartbeat_in_flight) return;
    heartbeat_in_flight = true;
    try {
      const renewal_result = await pool.query<{ renewed: boolean }>(
        `select public.renew_intake_spine_execution_lease_v1(
           $1::uuid,
           $2::uuid,
           $3::integer
         ) as renewed`,
        [intake_session_id, lease_token, lease_seconds],
      );
      if (renewal_result.rows[0]?.renewed !== true) active = false;
    } catch (error) {
      console.error('[IntakeSpine] execution lease heartbeat failed', {
        intake_session_id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      heartbeat_in_flight = false;
    }
  };
  const heartbeat_timer = setInterval(
    () => void heartbeat(),
    heartbeat_interval_ms,
  );
  heartbeat_timer.unref?.();

  return {
    lease_token,
    assert_active: () => {
      if (!active || released) {
        throw new Error('intake_spine_orchestrator_execution_lease_lost');
      }
    },
    release: async () => {
      if (released) return;
      released = true;
      active = false;
      clearInterval(heartbeat_timer);
      try {
        await pool.query(
          `select public.release_intake_spine_execution_lease_v1(
             $1::uuid,
             $2::uuid
           )`,
          [intake_session_id, lease_token],
        );
      } catch (error) {
        console.error('[IntakeSpine] execution lease release failed', {
          intake_session_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

/**
 * Execute a real Universal Intake Spine session against preserved source bytes.
 *
 * This function is deliberately not wired to upload triggers. Preservation is
 * immediate; analysis remains an explicit governed action. Every persisted
 * output passes through register_intake_layer_execution_v4, which independently
 * re-canonicalizes the execution envelope and output inside PostgreSQL.
 */
export async function execute_intake_spine_session(
  request: intake_spine_orchestration_request,
): Promise<intake_spine_orchestration_result> {
  if (!UUID_RE.test(request.intake_session_id)) throw new Error('intake_spine_orchestrator_invalid_session_id');
  const as_of = normalize_date_only(request.as_of);
  if (!as_of) throw new Error('intake_spine_orchestrator_invalid_as_of');
  const jurisdiction = request.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error('intake_spine_orchestrator_jurisdiction_required');

  const pool = getPool();
  const execution_lease = await acquire_intake_spine_execution_lease(
    pool,
    request.intake_session_id,
  );
  try {
  const session_result = await pool.query<session_row>(
    `select
       s.intake_session_id::text,
       s.xmin::text as session_row_version,
       s.owner_user_id,
       s.session_type,
       s.entry_channel,
       s.source_label,
       s.privacy_mode,
       s.session_status,
       s.completion_state,
       s.user_selected_immediate_issue,
       s.metadata,
       cil.case_uuid::text,
       cib.legacy_case_id
     from public.intake_sessions s
     join public.case_intake_links cil
       on cil.intake_session_id = s.intake_session_id
      and cil.is_primary = true
      and cil.link_type = 'primary_projection'
     left join public.case_identity_bridge cib
       on cib.case_uuid = cil.case_uuid
     where s.intake_session_id = $1::uuid
       and s.session_type = 'live'
       and s.entry_channel = 'upload'
     order by cil.created_at asc
     limit 1`,
    [request.intake_session_id],
  );
  const session = session_result.rows[0];
  if (!session) throw new Error('intake_spine_orchestrator_session_not_found');
  if (session.privacy_mode !== 'private') throw new Error('intake_spine_orchestrator_private_session_required');
  if (session.session_status === 'deleted') throw new Error('intake_spine_orchestrator_deleted_session');

  const artifact_result = await pool.query<source_artifact_row>(
    `select
       ia.artifact_id::text,
       ia.artifact_key,
       ia.filename,
       ia.mime_type,
       ia.byte_size,
       ia.sha256,
       ia.storage_bucket,
       ia.storage_object_path,
       ia.artifact_status,
       ia.availability,
       ia.metadata
     from public.intake_artifacts ia
     join public.documents d
       on coalesce(ia.metadata ->> 'legacy_document_id', '') ~ '^[0-9]+$'
      and d.id = (ia.metadata ->> 'legacy_document_id')::integer
     where ia.intake_session_id = $1::uuid
       and ia.artifact_type = 'source_document'
       and coalesce(d.document_resolution, 'active') = 'active'
     order by ia.artifact_key, ia.artifact_id`,
    [request.intake_session_id],
  );
  const source_artifacts = artifact_result.rows;
  if (source_artifacts.length === 0) throw new Error('intake_spine_orchestrator_no_source_artifacts');

  const governed = await load_governed_legal_registry();
  const receipts: intake_spine_execution_receipt[] = [];
  const dependencies = new Map<string, persisted_dependency>();
  const persist_execution_layer = <T>(input: persist_layer_input<T>) => {
    execution_lease.assert_active();
    return persist_layer(input, execution_lease.lease_token);
  };

  const stabilization_input = read_stabilization_input(session);
  const l1 = processLayer1(stabilization_input, as_of);
  await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l1,
    rule_manifest_hash: L1_RULE_HASH,
    canonical_input: { stabilization_input: canonical_stabilization_input(stabilization_input), as_of },
    input_refs: [{ type: 'intake_session', intake_session_id: session.intake_session_id }],
    receipts,
    dependencies,
  });

  const parsed_artifacts = [] as Awaited<ReturnType<typeof parseArtifact>>[];
  const seen_hashes: string[] = [];
  const source_receipts: persisted_dependency[] = [];

  for (const artifact of source_artifacts) {
    const expected_size = normalize_byte_size(artifact.byte_size, artifact.artifact_id);
    if (!artifact.sha256 || !SHA256_RE.test(artifact.sha256)) {
      throw new Error(`intake_spine_orchestrator_invalid_source_sha256:${artifact.artifact_id}`);
    }
    const source = await read_intake_source_artifact_bytes({
      artifact_id: artifact.artifact_id,
      artifact_key: artifact.artifact_key,
      storage_bucket: artifact.storage_bucket,
      storage_object_path: artifact.storage_object_path,
      byte_size: expected_size,
      sha256: artifact.sha256,
    });

    const declared_mime_type = artifact.mime_type?.trim().toLowerCase() || 'application/octet-stream';
    const filename = artifact.filename || '';
    const l2 = processLayer2({
      filename,
      bytes: source.bytes,
      declared_mime_type,
      entry_channel: session.entry_channel,
    }, seen_hashes);
    const l2Persisted = await persist_execution_layer({
      session_id: session.intake_session_id,
      result: l2,
      rule_manifest_hash: L2_RULE_HASH,
      canonical_input: {
        source_artifact_id: artifact.artifact_id,
        source_artifact_key: artifact.artifact_key,
        filename,
        sha256: source.verified_sha256,
        byte_size: source.verified_byte_size,
        declared_mime_type,
        entry_channel: session.entry_channel,
        existing_hashes: [...seen_hashes].sort(),
      },
      input_refs: [{
        type: 'source_artifact',
        artifact_id: artifact.artifact_id,
        artifact_key: artifact.artifact_key,
        sha256: source.verified_sha256,
      }],
      receipts,
      dependencies,
      dependency_key: `raw_intake_capture:${artifact.artifact_id}`,
    });
    seen_hashes.push(source.verified_sha256);

    const l3 = processLayer3({ record: l2.data, actual_bytes: source.bytes }, as_of);
    const l3Persisted = await persist_execution_layer({
      session_id: session.intake_session_id,
      result: l3,
      rule_manifest_hash: L3_RULE_HASH,
      canonical_input: {
        raw_intake_capture_output_hash: l2Persisted.output_hash,
        source_artifact_id: artifact.artifact_id,
        expected_sha256: artifact.sha256,
        verified_sha256: source.verified_sha256,
        verified_byte_size: source.verified_byte_size,
        as_of,
      },
      input_refs: [dependency_ref(l2Persisted), {
        type: 'source_artifact',
        artifact_id: artifact.artifact_id,
        artifact_key: artifact.artifact_key,
        sha256: source.verified_sha256,
      }],
      receipts,
      dependencies,
      dependency_key: `evidence_preservation:${artifact.artifact_id}`,
    });
    source_receipts.push(l3Persisted);

    const parsed = await parseArtifact(
      artifact.artifact_key,
      source.bytes,
      declared_mime_type,
      artifact.filename ?? undefined,
    );
    if (parsed.raw_bytes_sha256 !== source.verified_sha256) {
      throw new Error(`intake_spine_orchestrator_parser_raw_hash_mismatch:${artifact.artifact_id}`);
    }
    if (parsed.parser_rule_manifest_hash !== PARSER_RULE_MANIFEST_HASH) {
      throw new Error(`intake_spine_orchestrator_parser_manifest_mismatch:${artifact.artifact_id}`);
    }
    parsed_artifacts.push(parsed);
  }

  const parser_input_manifest = parsed_artifacts
    .map(parsed => ({
      artifact_key: parsed.artifact_key,
      source_filename: parsed.source_filename ?? null,
      raw_bytes_sha256: parsed.raw_bytes_sha256,
      declared_mime_type: parsed.declared_mime_type,
      detected_mime_type: parsed.detected_mime_type,
      effective_mime_type: parsed.mime_type,
      byte_size: parsed.byte_size,
      extraction_status: parsed.extraction_status,
      extraction_method: parsed.extraction_method,
      parser_version: parsed.parser_version,
      parser_rule_manifest_hash: parsed.parser_rule_manifest_hash,
      parsed_output_hash: computeHash({ extracted_text: parsed.extracted_text, spans: parsed.spans }),
    }))
    .sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_refs = source_receipts.map(dependency_ref);

  const l4 = processLayer4({ artifacts: parsed_artifacts });
  const l6 = processLayer6({ artifacts: parsed_artifacts });
  const l7 = processLayer7({ entities: l6.data, artifacts: parsed_artifacts });
  const l9 = processLayer9({ entities: l6.data, artifacts: parsed_artifacts });

  // Preservation (Layers 1-3) is independently receipt-bound. Derived
  // semantics fail closed as one unit before any derived layer is persisted.
  assertDerivedSemanticQuality({
    artifacts: parsed_artifacts,
    chronology: l4.data,
    entities: l6.data,
    relationships: l7.data,
    state_transitions: l9.data,
  });

  const l4Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l4,
    rule_manifest_hash: L4_RULE_HASH,
    canonical_input: { parsed_artifacts: parser_input_manifest },
    input_refs: parser_refs,
    receipts,
    dependencies,
    dependency_key: 'chronology_reconstruction',
  });

  const l6Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l6,
    rule_manifest_hash: L6_RULE_HASH,
    canonical_input: { parsed_artifacts: parser_input_manifest },
    input_refs: parser_refs,
    receipts,
    dependencies,
    dependency_key: 'entity_registry',
  });

  const l7Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l7,
    rule_manifest_hash: L7_RULE_HASH,
    canonical_input: {
      entity_registry_output_hash: l6Persisted.output_hash,
      parsed_artifacts: parser_input_manifest,
    },
    input_refs: [dependency_ref(l6Persisted), ...parser_refs],
    receipts,
    dependencies,
    dependency_key: 'relationship_graph',
  });

  const l9Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l9,
    rule_manifest_hash: L9_RULE_HASH,
    canonical_input: {
      entity_registry_output_hash: l6Persisted.output_hash,
      parsed_artifacts: parser_input_manifest,
    },
    input_refs: [dependency_ref(l6Persisted), ...parser_refs],
    receipts,
    dependencies,
    dependency_key: 'state_timeline',
  });

  const l5 = processLayer5({ transitions: l9.data, relationships: l7.data });
  const l5Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l5,
    rule_manifest_hash: L5_RULE_HASH,
    canonical_input: {
      relationship_graph_output_hash: l7Persisted.output_hash,
      state_timeline_output_hash: l9Persisted.output_hash,
    },
    input_refs: [dependency_ref(l7Persisted), dependency_ref(l9Persisted)],
    receipts,
    dependencies,
    dependency_key: 'verification_gate',
  });

  const l8 = processLayer8({ relationships: l7.data });
  const l8Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l8,
    rule_manifest_hash: L8_RULE_HASH,
    canonical_input: { relationship_graph_output_hash: l7Persisted.output_hash },
    input_refs: [dependency_ref(l7Persisted)],
    receipts,
    dependencies,
    dependency_key: 'power_dynamics_registry',
  });

  const l10 = processLayer10({ transitions: l9.data });
  const l10Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l10,
    rule_manifest_hash: L10_RULE_HASH,
    canonical_input: { state_timeline_output_hash: l9Persisted.output_hash },
    input_refs: [dependency_ref(l9Persisted)],
    receipts,
    dependencies,
    dependency_key: 'pattern_registry',
  });

  const l11 = processLayer11({ transitions: l9.data });
  const l11Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l11,
    rule_manifest_hash: L11_RULE_HASH,
    canonical_input: { state_timeline_output_hash: l9Persisted.output_hash },
    input_refs: [dependency_ref(l9Persisted)],
    receipts,
    dependencies,
    dependency_key: 'cascade_registry',
  });

  const l12RuleHash = computeLayer12ExecutionRuleManifestHash(governed.rule_manifest_hash);
  const l12 = processLayer12({
    entities: l6.data,
    relationships: l7.data,
    transitions: l9.data,
    patterns: l10.data,
    jurisdiction,
    governed_registry: governed.manifest,
    governed_registry_hash: governed.rule_manifest_hash,
  });
  const l12Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l12,
    rule_manifest_hash: l12RuleHash,
    canonical_input: {
      entity_registry_output_hash: l6Persisted.output_hash,
      relationship_graph_output_hash: l7Persisted.output_hash,
      state_timeline_output_hash: l9Persisted.output_hash,
      pattern_registry_output_hash: l10Persisted.output_hash,
      jurisdiction,
      governed_legal_registry_hash: governed.rule_manifest_hash,
    },
    input_refs: [
      dependency_ref(l6Persisted),
      dependency_ref(l7Persisted),
      dependency_ref(l9Persisted),
      dependency_ref(l10Persisted),
    ],
    receipts,
    dependencies,
    dependency_key: 'rights_and_duties_matrix',
  });

  const l13 = processLayer13({ events: l4.data, entities: l6.data, claims: l12.data });
  const l13Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l13,
    rule_manifest_hash: L13_RULE_HASH,
    canonical_input: {
      chronology_output_hash: l4Persisted.output_hash,
      entity_registry_output_hash: l6Persisted.output_hash,
      claim_candidate_output_hash: l12Persisted.output_hash,
    },
    input_refs: [dependency_ref(l4Persisted), dependency_ref(l6Persisted), dependency_ref(l12Persisted)],
    receipts,
    dependencies,
    dependency_key: 'translation_layer',
  });

  const l14RuleHash = computeLayer14ExecutionRuleManifestHash(governed.rule_manifest_hash);
  const l14 = processLayer14({
    candidates: l12.data,
    governed_registry: governed.manifest,
    governed_registry_hash: governed.rule_manifest_hash,
  });
  const l14Persisted = await persist_execution_layer({
    session_id: session.intake_session_id,
    result: l14,
    rule_manifest_hash: l14RuleHash,
    canonical_input: {
      claim_candidate_output_hash: l12Persisted.output_hash,
      governed_legal_registry_hash: governed.rule_manifest_hash,
    },
    input_refs: [dependency_ref(l12Persisted)],
    receipts,
    dependencies,
    dependency_key: 'action_paths',
  });

  execution_lease.assert_active();
  await finalize_intake_spine_session_if_unchanged(pool, {
    intake_session_id: session.intake_session_id,
    session_row_version: session.session_row_version,
    jurisdiction,
    as_of,
    required_layer_count: INTAKE_SPINE_LAYER_NAMES.length,
    sealed_receipt_count: receipts.length,
    execution_lease_token: execution_lease.lease_token,
  });

  return {
    intake_session_id: session.intake_session_id,
    case_uuid: session.case_uuid,
    legacy_case_id: session.legacy_case_id,
    source_artifact_count: source_artifacts.length,
    parsed_artifact_count: parsed_artifacts.filter(parsed => parsed.extraction_status === 'success').length,
    unsupported_or_failed_artifact_count: parsed_artifacts.filter(parsed => parsed.extraction_status !== 'success').length,
    governed_legal_registry_hash: governed.rule_manifest_hash,
    execution_order: receipts.map(receipt => receipt.layer_name),
    receipts,
    final_output_hashes: {
      chronology: l4Persisted.output_hash,
      verification: l5Persisted.output_hash,
      entities: l6Persisted.output_hash,
      relationships: l7Persisted.output_hash,
      power_dynamics: l8Persisted.output_hash,
      state_timeline: l9Persisted.output_hash,
      patterns: l10Persisted.output_hash,
      cascades: l11Persisted.output_hash,
      claim_candidates: l12Persisted.output_hash,
      translation: l13Persisted.output_hash,
      action_paths: l14Persisted.output_hash,
    },
  };
  } finally {
    await execution_lease.release();
  }
}

async function persist_layer<T>(
  input: persist_layer_input<T>,
  execution_lease_token: string,
): Promise<persisted_dependency> {
  if (!SHA256_RE.test(input.rule_manifest_hash)) {
    throw new Error(`intake_spine_orchestrator_rule_manifest_hash_invalid:${input.result.layer_name}`);
  }
  const execution_envelope = {
    canonical_input: input.canonical_input,
    layer_version: input.result.layer_version,
    rule_version: input.result.rule_version,
    rule_manifest_hash: input.rule_manifest_hash,
    parser_version: input.result.parser_version,
    canonicalization_version: CANONICALIZATION_VERSION,
  };
  const execution_input_hash = computeExecutionHash(execution_envelope);
  const output_hash = computeHash(input.result.data);
  if (output_hash !== input.result.output_hash) {
    throw new Error(`intake_spine_orchestrator_engine_output_hash_mismatch:${input.result.layer_name}`);
  }

  const persisted = await register_intake_layer_execution({
    intake_session_id: input.session_id,
    execution_lease_token,
    layer_name: input.result.layer_name,
    layer_version: input.result.layer_version,
    rule_version: input.result.rule_version,
    parser_version: input.result.parser_version,
    rule_manifest_hash: input.rule_manifest_hash,
    execution_envelope,
    input_hash: execution_input_hash,
    output_data: input.result.data,
    output_hash,
    input_refs: input.input_refs,
    unresolved_dependencies: input.result.unresolved_dependencies,
  });
  const dependency: persisted_dependency = {
    layer_name: input.result.layer_name,
    layer_run_id: persisted.layer_run_id,
    output_artifact_id: persisted.output_artifact_id,
    receipt_hash: persisted.receipt_hash,
    output_hash,
  };
  if (input.dependency_key) input.dependencies.set(input.dependency_key, dependency);
  input.receipts.push({
    layer_name: input.result.layer_name,
    layer_version: input.result.layer_version,
    rule_version: input.result.rule_version,
    parser_version: input.result.parser_version,
    rule_manifest_hash: input.rule_manifest_hash,
    execution_input_hash,
    output_hash,
    layer_run_id: persisted.layer_run_id,
    output_artifact_id: persisted.output_artifact_id,
    receipt_hash: persisted.receipt_hash,
    reused_existing: persisted.reused_existing,
    unresolved_dependency_count: input.result.unresolved_dependencies.length,
  });
  return dependency;
}

function dependency_ref(dependency: persisted_dependency): Record<string, unknown> {
  return {
    type: 'layer_execution',
    layer_name: dependency.layer_name,
    layer_run_id: dependency.layer_run_id,
    output_artifact_id: dependency.output_artifact_id,
    receipt_hash: dependency.receipt_hash,
    output_hash: dependency.output_hash,
  };
}

function normalize_byte_size(value: string | number | null, artifact_id: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`intake_spine_orchestrator_invalid_byte_size:${artifact_id}`);
  }
  return parsed;
}

function normalize_date_only(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return null;
}

function canonical_stabilization_input(input: StabilizationInput): Record<string, unknown> {
  return {
    urgent_situation: input.urgent_situation?.trim() || null,
    deadlines: input.deadlines
      .map(deadline => ({
        description: deadline.description.trim(),
        date: deadline.date.trim(),
        is_irreversible: deadline.is_irreversible,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)),
    essential_services_at_risk: unique_sorted(input.essential_services_at_risk),
    evidence_to_preserve: unique_sorted(input.evidence_to_preserve),
    communication_limits: unique_sorted(input.communication_limits),
    support_people: unique_sorted(input.support_people),
    least_burdensome_action: input.least_burdensome_action?.trim() || null,
    what_can_wait: unique_sorted(input.what_can_wait),
  };
}

function read_stabilization_input(session: session_row): StabilizationInput {
  const metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const stabilization = metadata['stabilization'];
  const source = stabilization && typeof stabilization === 'object' && !Array.isArray(stabilization)
    ? stabilization as Record<string, unknown>
    : {};

  return {
    urgent_situation: text_or_undefined(source['urgent_situation']) || session.user_selected_immediate_issue || undefined,
    deadlines: deadline_array(source['deadlines']),
    essential_services_at_risk: string_array(source['essential_services_at_risk']),
    evidence_to_preserve: string_array(source['evidence_to_preserve']),
    communication_limits: string_array(source['communication_limits']),
    support_people: string_array(source['support_people']),
    least_burdensome_action: text_or_undefined(source['least_burdensome_action']),
    what_can_wait: string_array(source['what_can_wait']),
  };
}

function deadline_array(value: unknown): StabilizationInput['deadlines'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const description = text_or_undefined(row['description']);
    const date = text_or_undefined(row['date']);
    if (!description || !date || typeof row['is_irreversible'] !== 'boolean') return [];
    return [{ description, date, is_irreversible: row['is_irreversible'] }];
  });
}

function string_array(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean);
}

function text_or_undefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function unique_sorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).sort();
}
