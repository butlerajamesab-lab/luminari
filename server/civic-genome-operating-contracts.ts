import { getPool } from "./db";
import { get_genome_bill_by_source_id } from "./civic-genome-source-id";
import { load_rosetta_current_docket_result_for_binding } from "./civic-genome-rosetta-evaluation";
import { is_genome_rosetta_publication_quarantined } from "./civic-genome-rosetta-publication-quarantine";
import { get_kaleidoscope_civic_genome_contract } from "./civic-genome-kaleidoscope-contract";
import { get_rosetta_review_base_url } from "./civic-genome-rosetta-evaluation";
import { describeUnobservedCurrentResult, isCurrentResultHold } from "../shared/civic-genome-pipeline-observation";

export type civic_genome_contract_state =
  | "operational"
  | "available_unbound"
  | "bound_not_projected"
  | "stale"
  | "waiting"
  | "ready_empty"
  | "not_established"
  | "unavailable";

export type civic_genome_operating_contract = {
  service_key: "docket" | "rosetta" | "atlas" | "prism" | "viewfinder" | "kaleidoscope" | "esquire";
  display_name: string;
  external_url: string | null;
  role: string;
  state: civic_genome_contract_state;
  state_label: string;
  detail: string;
  observed_count: number;
  bound_count: number;
  last_observed_at: string | null;
  boundary: string;
};

export type civic_genome_operating_contracts = {
  generated_at: string;
  contracts: civic_genome_operating_contract[];
};

type local_contract_counts = {
  bill_count: string;
  latest_bill_observed_at: string | null;
  rosetta_binding_count: string;
  rosetta_assembly_count: string;
  latest_rosetta_assembled_at: string | null;
  relationship_count: string;
  latest_relationship_at: string | null;
  comparison_matrix_count: string;
  comparison_state_cell_count: string;
  latest_comparison_matrix_at: string | null;
  prism_deep_binding_count: string;
  prism_deep_run_count: string;
  prism_legacy_binding_count: string;
  latest_prism_deep_bound_at: string | null;
};

type atlas_contract_counts = {
  signal_count: string;
  latest_bridged_at: string | null;
  latest_current_atlas_observation_at: string | null;
};

const PRISM_DEEP_RULE_SET_ID = "prism-rosetta-structural-binding";
const PRISM_DEEP_RULE_SET_VERSION = "2.5.0";

export function atlas_bridge_is_stale(
  latest_bridged_at: string | null | undefined,
  latest_current_atlas_observation_at: string | null | undefined,
): boolean {
  if (!latest_current_atlas_observation_at) return false;
  if (!latest_bridged_at) return true;
  const bridge_ms = Date.parse(latest_bridged_at);
  const atlas_ms = Date.parse(latest_current_atlas_observation_at);
  if (!Number.isFinite(atlas_ms)) return false;
  if (!Number.isFinite(bridge_ms)) return true;
  return bridge_ms < atlas_ms;
}

const count = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function get_civic_genome_operating_contracts(): Promise<civic_genome_operating_contracts> {
  const pool = getPool();
  const local_result = await pool.query<local_contract_counts>(
    `select
       (select count(*)::text from public.civic_genome_bill) as bill_count,
       (select max(updated_at)::text from public.civic_genome_bill) as latest_bill_observed_at,
       (select count(*)::text from public.civic_genome_rosetta_source_binding) as rosetta_binding_count,
       (select count(*)::text from public.civic_genome_assembly_run where run_status = 'completed') as rosetta_assembly_count,
       (select max(completed_at)::text from public.civic_genome_assembly_run where run_status = 'completed') as latest_rosetta_assembled_at,
       (select count(*)::text from public.civic_genome_relationship where validation_state <> 'rejected') as relationship_count,
       (select max(updated_at)::text from public.civic_genome_relationship where validation_state <> 'rejected') as latest_relationship_at,
       (select count(*)::text from public.civic_genome_comparison_matrix) as comparison_matrix_count,
       (select count(*)::text from public.civic_genome_comparison_state_cell) as comparison_state_cell_count,
       (select max(created_at)::text from public.civic_genome_comparison_matrix) as latest_comparison_matrix_at,
       (select count(*)::text
          from public.civic_genome_prism_verification_binding
         where prism_rule_set_id = $1
           and prism_rule_set_version = $2) as prism_deep_binding_count,
       (select count(*)::text
          from public.civic_genome_prism_verification_run
         where receipt_count = expected_trait_count
           and prism_rule_set_id = $1
           and prism_rule_set_version = $2) as prism_deep_run_count,
       (select count(*)::text
          from public.civic_genome_prism_verification_binding
         where prism_rule_set_id = $1
           and prism_rule_set_version <> $2) as prism_legacy_binding_count,
       (select max(created_at)::text
          from public.civic_genome_prism_verification_binding
         where prism_rule_set_id = $1
           and prism_rule_set_version = $2) as latest_prism_deep_bound_at`,
    [PRISM_DEEP_RULE_SET_ID, PRISM_DEEP_RULE_SET_VERSION],
  );
  const local = local_result.rows[0];

  let atlas: atlas_contract_counts | null = null;
  try {
    const atlas_result = await pool.query<atlas_contract_counts>(
      `select
         (select count(*)::text
            from public.v_atlas_lighthouse_bridge_v1_verified) as signal_count,
         (select max(bridged_at)::text
            from public.v_atlas_lighthouse_bridge_v1_verified) as latest_bridged_at,
         (select max(latest_observed_at)::text
            from public.atlas_stream_runtime_projection_v1
           where is_current) as latest_current_atlas_observation_at`,
    );
    atlas = atlas_result.rows[0] ?? null;
  } catch {
    // The verified Atlas export is optional in local/test environments.
  }

  const bill_count = count(local?.bill_count);
  const rosetta_binding_count = count(local?.rosetta_binding_count);
  const rosetta_assembly_count = count(local?.rosetta_assembly_count);
  const atlas_signal_count = count(atlas?.signal_count);
  const relationship_count = count(local?.relationship_count);
  const comparison_matrix_count = count(local?.comparison_matrix_count);
  const comparison_state_cell_count = count(local?.comparison_state_cell_count);
  const prism_deep_binding_count = count(local?.prism_deep_binding_count);
  const prism_deep_run_count = count(local?.prism_deep_run_count);
  const prism_legacy_binding_count = count(local?.prism_legacy_binding_count);
  const generated_at = new Date().toISOString();
  const atlas_bridge_stale = atlas !== null
    && atlas_bridge_is_stale(
      atlas.latest_bridged_at,
      atlas.latest_current_atlas_observation_at,
    );
  const kaleidoscope_contract = await get_kaleidoscope_civic_genome_contract();

  return {
    generated_at,
    contracts: [
      {
        service_key: "docket",
        display_name: "Docket Room",
        external_url: null,
        role: "Source observation",
        state: bill_count > 0 ? "operational" : "ready_empty",
        state_label: bill_count > 0 ? "Operational" : "No materialized bills",
        detail: `${bill_count} Docket bills are materialized as Civic Genome observations.`,
        observed_count: bill_count,
        bound_count: bill_count,
        last_observed_at: local?.latest_bill_observed_at ?? null,
        boundary: "Docket owns source observations. Civic Genome references them without changing the official record.",
      },
      {
        service_key: "rosetta",
        display_name: "Rosetta",
        external_url: get_rosetta_review_base_url(),
        role: "Structural law extraction",
        state: rosetta_assembly_count > 0 ? "operational" : "waiting",
        state_label: rosetta_assembly_count > 0 ? "Operational" : "Waiting for validated extraction",
        detail: `${rosetta_binding_count} explicit source bindings and ${rosetta_assembly_count} completed assemblies are materialized.`,
        observed_count: rosetta_assembly_count,
        bound_count: rosetta_binding_count,
        last_observed_at: local?.latest_rosetta_assembled_at ?? null,
        boundary: "Rosetta owns five-layer extraction. Civic Genome accepts only completed, provenance-valid law-view outputs; Lighthouse links to the standalone service without duplicating it.",
      },
      {
        service_key: "atlas",
        display_name: "Atlas",
        external_url: null,
        role: "Verified signal reference",
        state: atlas === null
          ? "unavailable"
          : atlas_bridge_stale
            ? "stale"
            : atlas_signal_count > 0
              ? "available_unbound"
              : "ready_empty",
        state_label: atlas === null
          ? "Verified export unavailable"
          : atlas_bridge_stale
            ? "Lighthouse bridge stale"
            : atlas_signal_count > 0
              ? "Available, not Genome-bound"
              : "Verified export empty",
        detail: atlas === null
          ? "The verified Atlas export could not be observed."
          : atlas_bridge_stale
            ? `${atlas_signal_count} verified Atlas bridge rows are preserved through ${atlas.latest_bridged_at ?? "unknown"}, while current Atlas runtime observations extend through ${atlas.latest_current_atlas_observation_at ?? "unknown"}; the Lighthouse bridge is behind current Atlas observation truth.`
            : `${atlas_signal_count} verified Atlas signals are available; no bill-level Civic Genome binding is asserted.`,
        observed_count: atlas_signal_count,
        bound_count: 0,
        last_observed_at: atlas?.latest_bridged_at ?? null,
        boundary: "Atlas owns signals. Civic Genome may reference the verified export only after an explicit identity contract.",
      },
      {
        service_key: "prism",
        display_name: "Prism",
        external_url: null,
        role: "Deterministic source replay and structural verification",
        state: prism_deep_run_count > 0 ? "operational" : prism_deep_binding_count > 0 ? "available_unbound" : "ready_empty",
        state_label: prism_deep_run_count > 0 ? "Operational" : prism_deep_binding_count > 0 ? "Deep receipts available" : "No deep verification receipts",
        detail: `${prism_deep_binding_count} independently replayed trait receipts across ${prism_deep_run_count} complete deep verification runs are materialized; ${prism_legacy_binding_count} legacy binding-only receipts remain preserved.`,
        observed_count: prism_deep_binding_count,
        bound_count: prism_deep_binding_count,
        last_observed_at: local?.latest_prism_deep_bound_at ?? null,
        boundary: "Prism independently replays immutable Rosetta source snapshots and re-executes declared structural verification rules. It records support, contradictions, missing evidence, and unresolved conditions without rewriting Rosetta-owned extraction output.",
      },
      {
        service_key: "viewfinder",
        display_name: "Viewfinder",
        external_url: null,
        role: "Jurisdiction comparison",
        state: comparison_matrix_count > 0 ? "operational" : "ready_empty",
        state_label: comparison_matrix_count > 0 ? "Operational" : "Substrate ready, no matrices",
        detail: `${comparison_matrix_count} comparison matrices and ${comparison_state_cell_count} jurisdiction cells are materialized.`,
        observed_count: comparison_state_cell_count,
        bound_count: comparison_matrix_count,
        last_observed_at: local?.latest_comparison_matrix_at ?? null,
        boundary: "Viewfinder reads Civic Genome comparison projections and does not mutate source observations.",
      },
      kaleidoscope_contract,
      {
        service_key: "esquire",
        display_name: "Esquire",
        external_url: null,
        role: "Action packaging",
        state: relationship_count > 0 ? "available_unbound" : "not_established",
        state_label: relationship_count > 0 ? "Genome evidence available, unbound" : "Contract not established",
        detail: `${relationship_count} validated or observed Genome relationships are available; no Esquire packet binding is asserted.`,
        observed_count: relationship_count,
        bound_count: 0,
        last_observed_at: local?.latest_relationship_at ?? null,
        boundary: "Esquire may package validated downstream outputs but does not own Civic Genome evidence.",
      },
    ],
  };
}

export type civic_genome_rosetta_pipeline_state =
  | "not_handed_off"
  | "current_pending"
  | "awaiting_current_result"
  | "waiting_for_extraction"
  | "ready_for_assembly"
  | "assembled"
  | "blocked"
  | "contract_error";

export type civic_genome_rosetta_pipeline_status = {
  source_bill_id: number;
  genome_bill_id: string | null;
  current_version_type: string | null;
  current_processing_state: string | null;
  source_document_id: number | null;
  extraction_run_id: number | null;
  run_status: string | null;
  provenance_state: string | null;
  object_count: number | null;
  coverage: Record<string, number> | null;
  published_version_type: string | null;
  published_processing_state: string | null;
  published_source_document_id: number | null;
  published_extraction_run_id: number | null;
  published_provenance_state: string | null;
  published_object_count: number | null;
  queue_state: string | null;
  queue_attempt_count: number | null;
  queue_last_failure_class: string | null;
  queue_next_attempt_at: string | null;
  queue_locked_at: string | null;
  can_assemble: boolean;
  contract_state: civic_genome_rosetta_pipeline_state;
  contract_message: string;
};

/**
 * Current Rosetta status is source-bound observation, not an execution trigger.
 * Legacy run_version order and historical "verified" labels are never a
 * selectable or publishable result. The published_* compatibility keys are
 * retained for API shape only and remain unobserved until independently
 * re-established by the selected current runtime.
 */
export async function get_civic_genome_rosetta_pipeline_status(
  source_bill_id: number,
): Promise<civic_genome_rosetta_pipeline_status> {
  const [bill, version_result] = await Promise.all([
    get_genome_bill_by_source_id(source_bill_id),
    getPool().query<{
      current_version_type: string | null;
      current_processing_state: string | null;
      current_source_document_id: number | null;
      current_source_document_key: string | null;
      current_source_content_hash: string | null;
      queue_state: string | null;
      queue_attempt_count: number | null;
      queue_last_failure_class: string | null;
      queue_next_attempt_at: string | null;
      queue_locked_at: string | null;
    }>(
      `with current_version as (
         select bill_version_id, version_type, processing_state,
                rosetta_source_document_id::integer as current_source_document_id,
                source_document_key as current_source_document_key,
                receipt_json ->> 'source_content_hash' as current_source_content_hash
           from public.civic_genome_bill_version
          where source_bill_id = $1
            and document_family = 'text'
          order by stage_rank desc, provider_sequence desc, updated_at desc, bill_version_id
          limit 1
       )
       select current.version_type as current_version_type,
              current.processing_state as current_processing_state,
              current.current_source_document_id,
              current.current_source_document_key,
              current.current_source_content_hash,
              queue.queue_state,
              queue.attempt_count as queue_attempt_count,
              queue.last_failure_class as queue_last_failure_class,
              queue.next_attempt_at::text as queue_next_attempt_at,
              queue.locked_at::text as queue_locked_at
         from current_version current
         left join lateral (
           select queue_state, attempt_count, last_failure_class, next_attempt_at, locked_at
             from public.civic_genome_legislative_version_queue
            where bill_version_id = current.bill_version_id
            order by updated_at desc, queue_id
            limit 1
         ) queue on true`,
      [source_bill_id],
    ),
  ]);

  const version = version_result.rows[0] ?? null;
  const source_document_id = version?.current_source_document_id ?? null;
  const shared = {
    source_bill_id,
    genome_bill_id: bill?.genome_bill_id ?? null,
    current_version_type: version?.current_version_type ?? null,
    current_processing_state: version?.current_processing_state ?? null,
    source_document_id,
    published_version_type: null,
    published_processing_state: null,
    published_source_document_id: null,
    published_extraction_run_id: null,
    published_provenance_state: null,
    published_object_count: null,
    queue_state: version?.queue_state ?? null,
    queue_attempt_count: version?.queue_attempt_count ?? null,
    queue_last_failure_class: version?.queue_last_failure_class ?? null,
    queue_next_attempt_at: version?.queue_next_attempt_at ?? null,
    queue_locked_at: version?.queue_locked_at ?? null,
  };
  const unobserved = {
    ...shared,
    extraction_run_id: null,
    run_status: null,
    provenance_state: null,
    object_count: null,
    coverage: null,
    can_assemble: false,
  };

  if (
    !source_document_id
    || !version?.current_source_document_key
    || !version.current_source_content_hash
    || !/^[0-9a-f]{64}$/i.test(version.current_source_content_hash)
  ) {
    return {
      ...unobserved,
      contract_state: source_document_id ? "waiting_for_extraction" : "not_handed_off",
      contract_message: source_document_id
        ? "A source identifier exists but an exact source key and content-hash binding have not both been established. No current decomposition is inferred."
        : describeUnobservedCurrentResult(unobserved),
    };
  }

  let observation;
  try {
    observation = await load_rosetta_current_docket_result_for_binding({
      source_document_key: version.current_source_document_key,
      source_content_hash: version.current_source_content_hash,
    });
  } catch {
    return {
      ...unobserved,
      contract_state: "contract_error",
      contract_message: "The exact Docket source binding is preserved, but the selected-runtime Rosetta result could not be verified. No historical result is substituted.",
    };
  }

  if (!observation || observation.status !== "complete" || !observation.current_result) {
    const held = isCurrentResultHold(shared)
      || observation?.status === "requires_review"
      || observation?.status === "awaiting_analysis";
    return {
      ...unobserved,
      contract_state: held ? "awaiting_current_result" : "waiting_for_extraction",
      contract_message: held
        ? "The exact source is preserved; the current selected-runtime result is held. No older decomposition or published snapshot is substituted."
        : describeUnobservedCurrentResult(unobserved),
    };
  }

  const current = observation.current_result;
  // Fail closed even if a mocked/custom transport bypasses the decoder.
  if (
    observation.docket_source_key !== version.current_source_document_key
    || observation.source_content_hash.toLowerCase() !== version.current_source_content_hash.toLowerCase()
    || (
      observation.current_source_status?.rosetta_source_document_id != null
      && observation.current_source_status.rosetta_source_document_id !== source_document_id
    )
  ) {
    return {
      ...unobserved,
      contract_state: "contract_error",
      contract_message: "Current Rosetta source identity disagrees with the selected Docket source. No result admitted.",
    };
  }

  // A complete selected result is not permission to assemble or publish.
  // Only a matching, independently observed generation target can open the
  // capability after the separate publication quarantine is lifted.
  let admitted = false;
  if (!is_genome_rosetta_publication_quarantined()) {
    const target = await getPool().query<{
      engine_version: string; rule_set_version: string; rule_manifest_hash: string;
    }>(
      "select engine_version,rule_set_version,rule_manifest_hash from public.civic_genome_rosetta_generation_target where target_name='current'",
    );
    const selected = target.rows[0];
    admitted = !!selected
      && selected.engine_version === current.engine_version
      && selected.rule_set_version === current.rule_set_version
      && selected.rule_manifest_hash.toLowerCase() === current.rule_manifest_hash.toLowerCase();
  }
  return {
    ...shared,
    extraction_run_id: Number(current.extraction_run_id),
    run_status: "completed",
    provenance_state: null, // Public current result has no object-level provenance layer.
    object_count: null, // Object counts are not supplied by the current result API.
    coverage: null, // Layer status receipts are nonnumeric; never fabricate coverage.
    can_assemble: admitted,
    contract_state: admitted ? "ready_for_assembly" : "awaiting_current_result",
    contract_message: admitted
      ? "An exact current-result receipt agrees with the selected-runtime target. Assembly is separately governed."
      : "A selected-runtime result exists, but Genome publication is quarantined or its generation target is unverified. No historic output is substituted.",
  };
}

