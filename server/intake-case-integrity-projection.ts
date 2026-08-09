import { TRPCError } from "@trpc/server";

import { getPool } from "./db-legacy";
import {
  INTAKE_CANONICALIZATION_VERSION,
  INTAKE_EXECUTION_CONTRACT_VERSION,
} from "./intake-case-layer-reader";
import { computeHash } from "./engines/intake-spine/utils";
import type { PreservationResult } from "./engines/intake-spine/layer-3-evidence_preservation";
import { derive_raw_artifact_key } from "./engines/intake-spine/layer-2-raw_intake_capture";

const SHA256_RE = /^[0-9a-f]{64}$/;
const PRESERVATION_STATES = new Set<PreservationResult["integrity_status"]>([
  "preserved",
  "quarantined",
  "referenced_missing",
]);

export type IntakeIntegrityProjectionState =
  | "no_evidence"
  | "not_run"
  | "partial"
  | "verified"
  | "blocked";

export type IntakeIntegrityArtifactRecord = {
  artifact_id: string;
  intake_session_id: string;
  legacy_document_id: number | null;
  artifact_key: string;
  filename: string | null;
  mime_type: string | null;
  source_sha256: string | null;
  source_artifact_status: string;
  layer_run_id: string | null;
  layer_version: string | null;
  rule_version: string | null;
  input_hash: string | null;
  output_hash: string | null;
  receipt_hash: string | null;
  completed_at: string | Date | null;
  integrity_status: PreservationResult["integrity_status"] | null;
  verified_sha256: string | null;
  verification_timestamp: string | null;
  unresolved_dependencies: any[];
};

export type IntakeIntegrityProjection = {
  projection_state: IntakeIntegrityProjectionState;
  source_artifact_count: number;
  projected_artifact_count: number;
  preserved_count: number;
  quarantined_count: number;
  referenced_missing_count: number;
  unresolved_dependency_count: number;
  artifacts: IntakeIntegrityArtifactRecord[];
};

function integrity_failure(message: string, cause?: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Intake Spine evidence-preservation integrity failure: ${message}`,
    cause,
  });
}

/**
 * Read the current case's source-document population and bind every source
 * artifact to its latest eligible sealed Layer 3 execution. Unlike the generic
 * singleton-layer reader, Layer 3 is repeated once per source artifact, so the
 * projection ranks executions by source_artifact_id instead of by session.
 *
 * Old fixture receipts and unsealed/incomplete runs are deliberately ignored.
 * Any eligible current-contract run that fails its preserved-output/hash
 * contract fails closed rather than being presented as healthy.
 */
export async function read_case_intake_integrity_projection(
  case_id: number,
): Promise<IntakeIntegrityProjection> {
  const result = await getPool().query(
    `with linked_sessions as (
       select cil.intake_session_id
         from public.case_identity_bridge cib
         join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
         join public.intake_sessions s on s.intake_session_id = cil.intake_session_id
        where cib.legacy_case_id = $1
          and cil.is_primary = true
          and cil.link_type = 'primary_projection'
          and s.session_type = 'live'
          and s.entry_channel = 'upload'
     ), source_artifacts as (
       select
         ia.artifact_id,
         ia.intake_session_id,
         ia.artifact_key,
         ia.filename,
         ia.mime_type,
         ia.sha256,
         ia.artifact_status,
         ia.metadata
       from linked_sessions ls
       join public.intake_artifacts ia on ia.intake_session_id = ls.intake_session_id
       join public.documents d
         on coalesce(ia.metadata ->> 'legacy_document_id', '') ~ '^[0-9]+$'
        and d.id = (ia.metadata ->> 'legacy_document_id')::integer
      where ia.artifact_type = 'source_document'
        and coalesce(d.document_resolution, 'active') = 'active'
     ), ranked_preservation as (
       select
         lr.*,
         source_ref.value ->> 'artifact_id' as source_artifact_id,
         source_ref.value ->> 'artifact_key' as source_ref_artifact_key,
         source_ref.value ->> 'sha256' as source_ref_sha256,
         row_number() over (
           partition by source_ref.value ->> 'artifact_id'
           order by lr.sealed_at desc nulls last,
                    lr.completed_at desc nulls last,
                    lr.started_at desc nulls last,
                    lr.layer_run_id desc
         ) as artifact_rank
       from linked_sessions ls
       join public.intake_layer_runs lr on lr.intake_session_id = ls.intake_session_id
       cross join lateral jsonb_array_elements(coalesce(lr.input_refs, '[]'::jsonb)) as source_ref(value)
      where lr.layer_name = 'evidence_preservation'
        and lr.run_status = 'completed'
        and lr.is_sealed = true
        and lr.receipt ->> 'receipt_type' = 'layer_execution'
        and lr.receipt ->> 'execution_contract_version' = $2
        and lr.canonicalization_version = $3
        and source_ref.value ->> 'type' = 'source_artifact'
        and coalesce(source_ref.value ->> 'artifact_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     )
     select
       s.artifact_id::text,
       s.intake_session_id::text,
       s.metadata,
       s.artifact_key,
       s.filename,
       s.mime_type,
       s.sha256 as source_sha256,
       s.artifact_status as source_artifact_status,
       p.layer_run_id::text,
       p.source_ref_artifact_key,
       p.source_ref_sha256,
       p.layer_name,
       p.layer_version,
       p.rule_version,
       p.input_hash,
       p.input_refs,
       p.output_hash,
       p.output_refs,
       p.unresolved_dependencies,
       p.receipt,
       p.receipt_hash,
       p.canonicalization_version,
       p.completed_at,
       oa.artifact_id::text as output_artifact_id,
       oa.artifact_type as output_artifact_type,
       oa.artifact_status as output_artifact_status,
       oa.metadata as output_metadata
     from source_artifacts s
     left join ranked_preservation p
       on p.source_artifact_id = s.artifact_id::text
      and p.artifact_rank = 1
     left join public.intake_artifacts oa
       on oa.artifact_id = case
         when coalesce(p.receipt ->> 'output_artifact_id', '') ~
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then (p.receipt ->> 'output_artifact_id')::uuid
         else null
       end
     order by s.intake_session_id, s.artifact_key, s.artifact_id`,
    [
      case_id,
      INTAKE_EXECUTION_CONTRACT_VERSION,
      INTAKE_CANONICALIZATION_VERSION,
    ],
  );

  return project_intake_integrity_rows(result.rows);
}

/**
 * Deterministically validate and project the SQL result. This stays separate
 * from the database read so the exact receipt-bound behavior can be exercised
 * with production-shaped rows and tamper cases.
 */
export function project_intake_integrity_rows(
  rows: readonly any[],
): IntakeIntegrityProjection {
  const artifacts: IntakeIntegrityArtifactRecord[] = rows.map((row: any) => {
    if (!row.layer_run_id) {
      return {
        artifact_id: String(row.artifact_id),
        intake_session_id: String(row.intake_session_id),
        legacy_document_id: normalize_legacy_document_id(
          row.metadata?.legacy_document_id,
        ),
        artifact_key: String(row.artifact_key),
        filename: row.filename ?? null,
        mime_type: row.mime_type ?? null,
        source_sha256: row.source_sha256 ?? null,
        source_artifact_status: String(row.source_artifact_status ?? "unknown"),
        layer_run_id: null,
        layer_version: null,
        rule_version: null,
        input_hash: null,
        output_hash: null,
        receipt_hash: null,
        completed_at: null,
        integrity_status: null,
        verified_sha256: null,
        verification_timestamp: null,
        unresolved_dependencies: [],
      };
    }

    if (!Array.isArray(row.input_refs)) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} input references are not an array`,
      );
    }
    if (!Array.isArray(row.output_refs)) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} output references are not an array`,
      );
    }
    if (!Array.isArray(row.unresolved_dependencies)) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} unresolved dependencies are not an array`,
      );
    }

    const input_refs = row.input_refs;
    const output_refs = row.output_refs;
    const unresolved_dependencies = row.unresolved_dependencies;
    const receipt =
      row.receipt &&
      typeof row.receipt === "object" &&
      !Array.isArray(row.receipt)
        ? row.receipt
        : {};
    const metadata = row.output_metadata ?? {};

    if (!row.receipt_hash || !SHA256_RE.test(row.receipt_hash)) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} has no valid receipt hash`,
      );
    }
    validate_receipt_bound_collection(
      row.layer_run_id,
      "input references",
      input_refs,
      receipt.input_refs_hash,
    );
    validate_receipt_bound_collection(
      row.layer_run_id,
      "output references",
      output_refs,
      receipt.output_refs_hash,
    );
    validate_receipt_bound_collection(
      row.layer_run_id,
      "unresolved dependencies",
      unresolved_dependencies,
      receipt.unresolved_dependencies_hash,
    );
    if (
      !row.output_artifact_id ||
      row.output_artifact_type !== "intake_layer_output" ||
      row.output_artifact_status !== "preserved"
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} is missing its preserved canonical output artifact`,
      );
    }
    if (
      receipt.output_artifact_id !== row.output_artifact_id ||
      output_refs.length !== 1 ||
      String(output_refs[0]?.artifact_id ?? "") !== row.output_artifact_id
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} output identity mismatch`,
      );
    }
    if (
      metadata.execution_contract_version !==
        INTAKE_EXECUTION_CONTRACT_VERSION ||
      metadata.canonicalization_version !== INTAKE_CANONICALIZATION_VERSION ||
      metadata.layer_name !== row.layer_name ||
      metadata.layer_version !== row.layer_version ||
      metadata.rule_version !== row.rule_version ||
      metadata.output_hash !== row.output_hash
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} output metadata differs from the sealed execution contract`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, "data")) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} has no canonical output data`,
      );
    }

    let recomputed_output_hash: string;
    try {
      recomputed_output_hash = computeHash(metadata.data);
    } catch (error) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} output cannot be canonically hashed`,
        error,
      );
    }
    if (recomputed_output_hash !== row.output_hash) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} output hash does not match preserved data`,
      );
    }

    const data = metadata.data as Partial<PreservationResult>;
    if (!row.source_sha256 || !SHA256_RE.test(row.source_sha256)) {
      integrity_failure(
        `Source artifact ${row.artifact_id} has no valid SHA-256 identity`,
      );
    }
    if (row.artifact_key !== `sha256:${row.source_sha256}`) {
      integrity_failure(
        `Source artifact ${row.artifact_id} registration key differs from its SHA-256 identity`,
      );
    }
    const expected_layer_artifact_key = derive_raw_artifact_key(
      row.source_sha256,
    );
    if (data.artifact_key !== expected_layer_artifact_key) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} points to the wrong source artifact`,
      );
    }
    if (
      !data.integrity_status ||
      !PRESERVATION_STATES.has(data.integrity_status)
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} has an invalid integrity status`,
      );
    }
    if (data.stored_sha256 !== row.source_sha256) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} stored hash differs from source registration`,
      );
    }
    if (
      data.integrity_status === "preserved" &&
      data.verified_sha256 !== row.source_sha256
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} verified hash differs from source registration`,
      );
    }
    if (
      data.integrity_status === "quarantined" &&
      (!data.verified_sha256 ||
        !SHA256_RE.test(data.verified_sha256) ||
        data.verified_sha256 === row.source_sha256)
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} has an invalid quarantined verification hash`,
      );
    }
    if (
      data.integrity_status === "referenced_missing" &&
      data.verified_sha256 !== null
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} has an invalid missing-source verification hash`,
      );
    }

    const source_refs = input_refs.filter(
      (ref: any) =>
        ref && typeof ref === "object" && ref.type === "source_artifact",
    );
    if (
      source_refs.length !== 1 ||
      String(source_refs[0]?.artifact_id ?? "") !== String(row.artifact_id) ||
      source_refs[0]?.artifact_key !== row.source_ref_artifact_key ||
      source_refs[0]?.sha256 !== row.source_ref_sha256
    ) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} source reference projection differs from sealed inputs`,
      );
    }
    if (row.source_ref_artifact_key !== row.artifact_key) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} source reference key differs from source registration`,
      );
    }

    // The source-reference key always names the registered artifact. Its hash
    // names the bytes supplied to Layer 3: the registered hash when preserved
    // or missing, and the independently verified digest when quarantined.
    const expected_source_ref_sha256 =
      data.integrity_status === "quarantined"
        ? data.verified_sha256
        : row.source_sha256;
    if (row.source_ref_sha256 !== expected_source_ref_sha256) {
      integrity_failure(
        `Layer 3 run ${row.layer_run_id} source reference hash differs from its preservation state`,
      );
    }

    return {
      artifact_id: String(row.artifact_id),
      intake_session_id: String(row.intake_session_id),
      legacy_document_id: normalize_legacy_document_id(
        row.metadata?.legacy_document_id,
      ),
      artifact_key: String(row.artifact_key),
      filename: row.filename ?? null,
      mime_type: row.mime_type ?? null,
      source_sha256: row.source_sha256 ?? null,
      source_artifact_status: String(row.source_artifact_status ?? "unknown"),
      layer_run_id: String(row.layer_run_id),
      layer_version: String(row.layer_version),
      rule_version: String(row.rule_version),
      input_hash: String(row.input_hash),
      output_hash: String(row.output_hash),
      receipt_hash: String(row.receipt_hash),
      completed_at: row.completed_at ?? null,
      integrity_status: data.integrity_status,
      verified_sha256: data.verified_sha256 ?? null,
      verification_timestamp: data.verification_timestamp ?? null,
      unresolved_dependencies,
    };
  });

  const source_artifact_count = artifacts.length;
  const projected = artifacts.filter(
    (artifact) => artifact.layer_run_id !== null,
  );
  const projected_artifact_count = projected.length;
  const preserved_count = projected.filter(
    (artifact) => artifact.integrity_status === "preserved",
  ).length;
  const quarantined_count = projected.filter(
    (artifact) => artifact.integrity_status === "quarantined",
  ).length;
  const referenced_missing_count = projected.filter(
    (artifact) => artifact.integrity_status === "referenced_missing",
  ).length;
  const unresolved_dependency_count = projected.reduce(
    (sum, artifact) => sum + artifact.unresolved_dependencies.length,
    0,
  );

  let projection_state: IntakeIntegrityProjectionState;
  if (source_artifact_count === 0) projection_state = "no_evidence";
  else if (projected_artifact_count === 0) projection_state = "not_run";
  else if (quarantined_count > 0 || referenced_missing_count > 0)
    projection_state = "blocked";
  else if (projected_artifact_count < source_artifact_count)
    projection_state = "partial";
  else projection_state = "verified";

  return {
    projection_state,
    source_artifact_count,
    projected_artifact_count,
    preserved_count,
    quarantined_count,
    referenced_missing_count,
    unresolved_dependency_count,
    artifacts,
  };
}

function validate_receipt_bound_collection(
  layer_run_id: unknown,
  label: string,
  value: unknown[],
  sealed_hash: unknown,
): void {
  if (typeof sealed_hash !== "string" || !SHA256_RE.test(sealed_hash)) {
    integrity_failure(
      `Layer 3 run ${layer_run_id} has no valid sealed ${label} hash`,
    );
  }

  let recomputed_hash: string;
  try {
    recomputed_hash = computeHash(value);
  } catch (error) {
    integrity_failure(
      `Layer 3 run ${layer_run_id} ${label} cannot be canonically hashed`,
      error,
    );
  }
  if (recomputed_hash !== sealed_hash) {
    integrity_failure(
      `Layer 3 run ${layer_run_id} ${label} differ from the sealed receipt`,
    );
  }
}

function normalize_legacy_document_id(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
