import { TRPCError } from "@trpc/server";

import { getPool } from "./db-legacy";
import { computeHash } from "./engines/intake-spine/utils";

export const INTAKE_EXECUTION_CONTRACT_VERSION = "luminari.intake.layer-execution.v1";
export const INTAKE_CANONICALIZATION_VERSION = "luminari.intake.canonical-json.v2";

export type CanonicalCaseLayerOutput<T> = {
  intake_session_id: string;
  layer_run_id: string;
  layer_name: string;
  layer_version: string;
  rule_version: string;
  parser_version: string;
  input_hash: string;
  output_hash: string;
  receipt_hash: string;
  completed_at: string | Date | null;
  unresolved_dependencies: any[];
  data: T;
};

export type CanonicalCaseLayerRead<T> = {
  state: "not_projected" | "canonical_projection";
  outputs: CanonicalCaseLayerOutput<T>[];
};

function integrity_failure(message: string, cause?: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Intake Spine layer projection integrity failure: ${message}`,
    cause,
  });
}

function as_array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export async function read_canonical_case_layer_outputs<T>(
  case_id: number,
  layer_name: string,
): Promise<CanonicalCaseLayerRead<T>> {
  const result = await getPool().query(
    `with linked_sessions as (
       select cil.intake_session_id
         from public.case_identity_bridge cib
         join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
        where cib.legacy_case_id = $1
     ), ranked as (
       select lr.*,
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
       r.intake_session_id::text,
       r.layer_run_id::text,
       r.layer_name,
       r.layer_version,
       r.rule_version,
       r.normalization_version,
       r.input_hash,
       r.output_hash,
       r.output_refs,
       r.unresolved_dependencies,
       r.receipt,
       r.receipt_hash,
       r.canonicalization_version,
       r.completed_at,
       a.artifact_id::text as output_artifact_id,
       a.artifact_type,
       a.artifact_status,
       a.metadata
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

  const eligible = result.rows.filter((row: any) =>
    row.receipt?.receipt_type === "layer_execution"
      && row.receipt?.execution_contract_version === INTAKE_EXECUTION_CONTRACT_VERSION
      && row.canonicalization_version === INTAKE_CANONICALIZATION_VERSION,
  );

  if (eligible.length === 0) {
    return { state: "not_projected", outputs: [] };
  }

  const outputs = eligible.map((row: any): CanonicalCaseLayerOutput<T> => {
    const metadata = row.metadata ?? {};
    const output_refs = as_array(row.output_refs);
    if (!row.receipt_hash || !/^[0-9a-f]{64}$/.test(row.receipt_hash)) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} has no valid receipt hash`);
    }
    if (!row.output_artifact_id
        || row.artifact_type !== "intake_layer_output"
        || row.artifact_status !== "preserved") {
      integrity_failure(`${layer_name} run ${row.layer_run_id} is missing its preserved canonical output artifact`);
    }
    if (row.receipt.output_artifact_id !== row.output_artifact_id
        || output_refs.length !== 1
        || String(output_refs[0]?.artifact_id ?? "") !== row.output_artifact_id) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} output identity mismatch`);
    }
    if (metadata.execution_contract_version !== INTAKE_EXECUTION_CONTRACT_VERSION
        || metadata.canonicalization_version !== INTAKE_CANONICALIZATION_VERSION
        || metadata.layer_name !== row.layer_name
        || metadata.layer_version !== row.layer_version
        || metadata.rule_version !== row.rule_version
        || metadata.output_hash !== row.output_hash) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} output metadata differs from the sealed execution contract`);
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, "data")) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} has no canonical output data`);
    }

    let recomputed_output_hash: string;
    try {
      recomputed_output_hash = computeHash(metadata.data);
    } catch (error) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} output cannot be canonically hashed`, error);
    }
    if (recomputed_output_hash !== row.output_hash) {
      integrity_failure(`${layer_name} run ${row.layer_run_id} output hash does not match preserved data`);
    }

    return {
      intake_session_id: String(row.intake_session_id),
      layer_run_id: String(row.layer_run_id),
      layer_name: String(row.layer_name),
      layer_version: String(row.layer_version),
      rule_version: String(row.rule_version),
      parser_version: String(row.normalization_version ?? "N/A"),
      input_hash: String(row.input_hash),
      output_hash: String(row.output_hash),
      receipt_hash: String(row.receipt_hash),
      completed_at: row.completed_at ?? null,
      unresolved_dependencies: as_array(row.unresolved_dependencies),
      data: metadata.data as T,
    };
  });

  return { state: "canonical_projection", outputs };
}
