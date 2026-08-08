import { getPool } from "./db-legacy";

export const INTAKE_SPINE_LAYER_NAMES = [
  "stabilization_envelope",
  "raw_intake_capture",
  "evidence_preservation",
  "chronology_reconstruction",
  "verification_gate",
  "entity_registry",
  "relationship_graph",
  "power_dynamics_registry",
  "state_timeline",
  "pattern_registry",
  "cascade_registry",
  "rights_and_duties_matrix",
  "translation_layer",
  "action_paths",
] as const;

export type intake_spine_layer_name = (typeof INTAKE_SPINE_LAYER_NAMES)[number];

export type intake_spine_case_layer_projection = {
  intake_session_id: string;
  source_label: string | null;
  session_status: string;
  completion_state: string;
  layer_name: intake_spine_layer_name;
  layer_run_id: string | null;
  layer_version: string | null;
  rule_version: string | null;
  parser_version: string | null;
  output_hash: string | null;
  receipt_hash: string | null;
  output_artifact_id: string | null;
  unresolved_dependencies: unknown[];
  sealed_at: string | null;
  data: unknown;
};

function as_array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Read the latest sealed Universal Intake Spine output for each live upload
 * session bound to a Lighthouse case.
 *
 * This is a read-only projection boundary. Canonical layer output remains owned
 * by intake_layer_runs + intake_artifacts; legacy case tables are not mutated or
 * silently promoted from this adapter.
 */
export async function get_intake_spine_case_layer_projections(
  case_id: number,
  layer_name: intake_spine_layer_name,
): Promise<intake_spine_case_layer_projection[]> {
  const { rows } = await getPool().query<{
    intake_session_id: string;
    source_label: string | null;
    session_status: string;
    completion_state: string;
    layer_name: intake_spine_layer_name;
    layer_run_id: string | null;
    layer_version: string | null;
    rule_version: string | null;
    parser_version: string | null;
    output_hash: string | null;
    receipt_hash: string | null;
    output_artifact_id: string | null;
    unresolved_dependencies: unknown;
    sealed_at: string | null;
    data: unknown;
  }>(
    `with live_sessions as (
       select
         s.intake_session_id,
         s.source_label,
         s.session_status,
         s.completion_state,
         s.created_at
       from public.intake_sessions s
       join public.case_intake_links cil
         on cil.intake_session_id = s.intake_session_id
       join public.case_identity_bridge cib
         on cib.case_uuid = cil.case_uuid
      where cib.legacy_case_id = $1
        and s.session_type = 'live'
        and s.entry_channel = 'upload'
     )
     select
       ls.intake_session_id::text,
       ls.source_label,
       ls.session_status,
       ls.completion_state,
       $2::text as layer_name,
       layer.layer_run_id::text,
       layer.layer_version,
       layer.rule_version,
       layer.normalization_version as parser_version,
       layer.output_hash,
       layer.receipt_hash,
       output_artifact.artifact_id::text as output_artifact_id,
       coalesce(layer.unresolved_dependencies, '[]'::jsonb) as unresolved_dependencies,
       layer.sealed_at::text,
       output_artifact.metadata -> 'data' as data
     from live_sessions ls
     left join lateral (
       select ilr.*
         from public.intake_layer_runs ilr
        where ilr.intake_session_id = ls.intake_session_id
          and ilr.layer_name = $2
          and ilr.run_status = 'completed'
          and ilr.is_sealed = true
        order by ilr.sealed_at desc nulls last, ilr.layer_run_id desc
        limit 1
     ) layer on true
     left join public.intake_artifacts output_artifact
       on output_artifact.artifact_id = nullif(layer.output_refs -> 0 ->> 'artifact_id', '')::uuid
      and output_artifact.intake_session_id = ls.intake_session_id
      and output_artifact.artifact_type = 'intake_layer_output'
      and output_artifact.artifact_status = 'preserved'
     order by ls.created_at asc, ls.intake_session_id asc`,
    [case_id, layer_name],
  );

  return rows.map(row => ({
    intake_session_id: row.intake_session_id,
    source_label: row.source_label,
    session_status: row.session_status,
    completion_state: row.completion_state,
    layer_name: row.layer_name,
    layer_run_id: row.layer_run_id,
    layer_version: row.layer_version,
    rule_version: row.rule_version,
    parser_version: row.parser_version,
    output_hash: row.output_hash,
    receipt_hash: row.receipt_hash,
    output_artifact_id: row.output_artifact_id,
    unresolved_dependencies: as_array(row.unresolved_dependencies),
    sealed_at: row.sealed_at,
    data: row.data ?? null,
  }));
}
