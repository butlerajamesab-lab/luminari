import { getPool } from "./db";
import { get_genome_bill_by_source_id } from "./civic-genome-source-id";
import {
  get_latest_rosetta_law_view_by_document_identifier,
  get_latest_rosetta_law_view_by_source_document,
  type civic_genome_rosetta_law_view,
} from "./civic-genome-rosetta-contract";
import { get_kaleidoscope_civic_genome_contract } from "./civic-genome-kaleidoscope-contract";

export type civic_genome_contract_state =
  | "operational"
  | "available_unbound"
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
  relationship_count: string;
  comparison_matrix_count: string;
  comparison_state_cell_count: string;
  prism_deep_binding_count: string;
  prism_deep_run_count: string;
  prism_legacy_binding_count: string;
  latest_prism_deep_bound_at: string | null;
};

type atlas_contract_counts = {
  signal_count: string;
  latest_bridged_at: string | null;
};

const ROSETTA_STANDALONE_URL = "https://rosetta-v3-platform.onrender.com";
const PRISM_DEEP_RULE_SET_ID = "prism-rosetta-structural-binding";
const PRISM_DEEP_RULE_SET_VERSION = "2.0.0";

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
       (select count(*)::text from public.civic_genome_relationship where validation_state <> 'rejected') as relationship_count,
       (select count(*)::text from public.civic_genome_comparison_matrix) as comparison_matrix_count,
       (select count(*)::text from public.civic_genome_comparison_state_cell) as comparison_state_cell_count,
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
         count(*)::text as signal_count,
         max(bridged_at)::text as latest_bridged_at
       from public.v_atlas_lighthouse_bridge_v1_verified`,
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

  return {
    generated_at: new Date().toISOString(),
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
        external_url: ROSETTA_STANDALONE_URL,
        role: "Structural law extraction",
        state: rosetta_assembly_count > 0 ? "operational" : "waiting",
        state_label: rosetta_assembly_count > 0 ? "Operational" : "Waiting for validated extraction",
        detail: `${rosetta_binding_count} explicit source bindings and ${rosetta_assembly_count} completed assemblies are materialized.`,
        observed_count: rosetta_assembly_count,
        bound_count: rosetta_binding_count,
        last_observed_at: null,
        boundary: "Rosetta owns five-layer extraction. Civic Genome accepts only completed, provenance-valid law-view outputs; Lighthouse links to the standalone service without duplicating it.",
      },
      {
        service_key: "atlas",
        display_name: "Atlas",
        external_url: null,
        role: "Verified signal reference",
        state: atlas === null ? "unavailable" : atlas_signal_count > 0 ? "available_unbound" : "ready_empty",
        state_label: atlas === null ? "Verified export unavailable" : atlas_signal_count > 0 ? "Available, not Genome-bound" : "Verified export empty",
        detail: atlas === null
          ? "The verified Atlas export could not be observed."
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
        last_observed_at: null,
        boundary: "Viewfinder reads Civic Genome comparison projections and does not mutate source observations.",
      },
      {
        ...get_kaleidoscope_civic_genome_contract(),
        external_url: null,
      },
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
        last_observed_at: null,
        boundary: "Esquire may package validated downstream outputs but does not own Civic Genome evidence.",
      },
    ],
  };
}

export type civic_genome_rosetta_pipeline_state =
  | "not_handed_off"
  | "current_pending"
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
  object_count: number;
  coverage: Record<string, number>;
  published_version_type: string | null;
  published_processing_state: string | null;
  published_source_document_id: number | null;
  published_extraction_run_id: number | null;
  published_provenance_state: string | null;
  published_object_count: number;
  can_assemble: boolean;
  contract_state: civic_genome_rosetta_pipeline_state;
  contract_message: string;
};

function valid_rosetta_output(view: civic_genome_rosetta_law_view): boolean {
  return view.run_status?.toLowerCase() === "completed"
    && view.law_view.provenanceState !== "failed"
    && view.law_view.objects.length > 0;
}

export async function get_civic_genome_rosetta_pipeline_status(
  source_bill_id: number,
): Promise<civic_genome_rosetta_pipeline_status> {
  const [bill, version_selection_result] = await Promise.all([
    get_genome_bill_by_source_id(source_bill_id),
    getPool().query<{
      current_version_type: string | null;
      current_processing_state: string | null;
      current_source_document_id: number | null;
      published_version_type: string | null;
      published_processing_state: string | null;
      published_source_document_id: number | null;
      published_extraction_run_id: string | null;
    }>(
      `with current_version as (
         select version_type,
                processing_state,
                rosetta_source_document_id,
                rosetta_extraction_run_id
           from public.civic_genome_bill_version
          where source_bill_id = $1
          order by stage_rank desc, provider_sequence desc, updated_at desc
          limit 1
       ), published_version as (
         select version_type,
                processing_state,
                rosetta_source_document_id,
                rosetta_extraction_run_id
           from public.civic_genome_bill_version
          where source_bill_id = $1
            and processing_state in ('verified', 'verified_with_findings')
            and rosetta_source_document_id is not null
            and assembly_run_id is not null
          order by stage_rank desc, provider_sequence desc, updated_at desc
          limit 1
       )
       select current.version_type as current_version_type,
              current.processing_state as current_processing_state,
              current.rosetta_source_document_id::integer as current_source_document_id,
              published.version_type as published_version_type,
              published.processing_state as published_processing_state,
              published.rosetta_source_document_id::integer as published_source_document_id,
              published.rosetta_extraction_run_id as published_extraction_run_id
         from current_version current
         full join published_version published on true`,
      [source_bill_id],
    ),
  ]);
  const version_selection = version_selection_result.rows[0] ?? null;
  const current_source_document_id = version_selection?.current_source_document_id ?? null;
  const published_source_document_id = version_selection?.published_source_document_id ?? null;
  const [rosetta_result, published_rosetta_result] = await Promise.all([
    (
      version_selection
      ? current_source_document_id == null
        ? Promise.resolve(null)
        : get_latest_rosetta_law_view_by_source_document(current_source_document_id)
      : get_latest_rosetta_law_view_by_document_identifier(String(source_bill_id))
    )
      .then(view => ({ view, error: null }))
      .catch(error => ({
        view: null,
        error: error instanceof Error ? error.message : "unknown_rosetta_contract_error",
      })),
    published_source_document_id == null
      || published_source_document_id === current_source_document_id
      ? Promise.resolve({ view: null, error: null })
      : get_latest_rosetta_law_view_by_source_document(published_source_document_id)
        .then(view => ({ view, error: null }))
        .catch(error => ({
          view: null,
          error: error instanceof Error ? error.message : "unknown_published_rosetta_contract_error",
        })),
  ]);

  const current_version_fields = {
    current_version_type: version_selection?.current_version_type ?? null,
    current_processing_state: version_selection?.current_processing_state ?? null,
  };
  const published_view = published_source_document_id === current_source_document_id
    ? rosetta_result.view
    : published_rosetta_result.view;
  const published_fields = {
    published_version_type: version_selection?.published_version_type ?? null,
    published_processing_state: version_selection?.published_processing_state ?? null,
    published_source_document_id,
    published_extraction_run_id: published_view?.extraction_run_id
      ?? (version_selection?.published_extraction_run_id
        ? Number(version_selection.published_extraction_run_id)
        : null),
    published_provenance_state: published_view?.law_view.provenanceState ?? null,
    published_object_count: published_view?.law_view.objects.length ?? 0,
  };

  if (rosetta_result.error) {
    return {
      source_bill_id,
      genome_bill_id: bill?.genome_bill_id ?? null,
      ...current_version_fields,
      source_document_id: null,
      extraction_run_id: null,
      run_status: null,
      provenance_state: null,
      object_count: 0,
      coverage: {},
      ...published_fields,
      can_assemble: false,
      contract_state: "contract_error",
      contract_message: "Rosetta's exact law-view export could not be observed.",
    };
  }

  const view = rosetta_result.view;
  if (!view) {
    if (published_source_document_id != null) {
      return {
        source_bill_id,
        genome_bill_id: bill?.genome_bill_id ?? null,
        ...current_version_fields,
        source_document_id: null,
        extraction_run_id: null,
        run_status: null,
        provenance_state: null,
        object_count: 0,
        coverage: {},
        ...published_fields,
        can_assemble: false,
        contract_state: "current_pending",
        contract_message: `The current ${version_selection?.current_version_type ?? "bill"} source is processing automatically. The latest verified ${version_selection?.published_version_type ?? "prior"} snapshot remains published until it completes.`,
      };
    }
    return {
      source_bill_id,
      genome_bill_id: bill?.genome_bill_id ?? null,
      ...current_version_fields,
      source_document_id: null,
      extraction_run_id: null,
      run_status: null,
      provenance_state: null,
      object_count: 0,
      coverage: {},
      ...published_fields,
      can_assemble: false,
      contract_state: "not_handed_off",
      contract_message: "No exact Rosetta source document exists for this Docket bill.",
    };
  }

  const output_is_valid = valid_rosetta_output(view);
  let assembled = false;
  if (bill && output_is_valid) {
    const result = await getPool().query<{ assembly_run_id: string }>(
      `select assembly_run_id
         from public.civic_genome_assembly_run
        where genome_bill_id = $1
          and source_document_id = $2
          and extraction_run_id = $3
          and run_status = 'completed'
        limit 1`,
      [bill.genome_bill_id, view.source_document_id, String(view.extraction_run_id)],
    );
    assembled = Boolean(result.rows[0]);
  }

  const run_status = view.run_status?.toLowerCase() ?? null;
  const current_is_verified = version_selection?.current_processing_state === "verified"
    || version_selection?.current_processing_state === "verified_with_findings";
  const prior_snapshot_available = published_source_document_id != null
    && published_source_document_id !== current_source_document_id;
  const state: civic_genome_rosetta_pipeline_state = assembled && current_is_verified
    ? "assembled"
    : prior_snapshot_available
      ? "current_pending"
    : output_is_valid && bill
      ? "ready_for_assembly"
      : run_status === "completed" || run_status === "failed"
        ? "blocked"
        : "waiting_for_extraction";
  const message = state === "assembled"
    ? "This exact completed Rosetta run is already assembled."
    : state === "current_pending"
      ? `The current ${version_selection?.current_version_type ?? "bill"} source is processing automatically. The latest verified ${version_selection?.published_version_type ?? "prior"} snapshot remains published until it completes.`
    : state === "ready_for_assembly"
      ? "A completed, provenance-valid Rosetta run is ready for deterministic assembly."
      : state === "blocked"
        ? "The latest Rosetta run is not a provenance-valid assembly input."
        : "The exact source handoff exists; Rosetta extraction must complete before assembly.";

  return {
    source_bill_id,
    genome_bill_id: bill?.genome_bill_id ?? null,
    ...current_version_fields,
    source_document_id: view.source_document_id,
    extraction_run_id: view.extraction_run_id,
    run_status: view.run_status,
    provenance_state: view.law_view.provenanceState,
    object_count: view.law_view.objects.length,
    coverage: Object.fromEntries(
      Object.entries(view.law_view.coverage)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    ),
    ...published_fields,
    can_assemble: state === "ready_for_assembly",
    contract_state: state,
    contract_message: message,
  };
}
