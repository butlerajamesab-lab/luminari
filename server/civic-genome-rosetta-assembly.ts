import type { PoolClient } from "pg";
import { getPool } from "./db";
import {
  get_latest_rosetta_law_view_by_source_document,
  get_rosetta_law_view_by_extraction_run,
  type civic_genome_rosetta_law_view,
} from "./civic-genome-rosetta-contract";
import { adaptRosettaToGenomeTraits, hashValue } from "./civic-genome/assembly-engine";

export const ROSETTA_GENOME_ENGINE_VERSION = "rosetta-genome-assembly-v1";
export const ROSETTA_GENOME_RULE_VERSION = "rosetta-five-layer-trait-map-v1";

export type rosetta_genome_assembly_request = {
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id?: number;
};

export type rosetta_genome_assembly_result = {
  assembly_run_id: string;
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id: string;
  input_hash: string;
  output_hash: string;
  verification_state: "complete" | "partial";
  trait_count: number;
  replayed: boolean;
};

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verification_state(view: civic_genome_rosetta_law_view): "complete" | "partial" {
  const covered = Object.values(view.law_view.coverage).filter(value => value === 1).length;
  return view.law_view.provenanceState === "complete" && covered === 5 ? "complete" : "partial";
}

function assert_view_identity(
  request: rosetta_genome_assembly_request,
  view: civic_genome_rosetta_law_view,
): void {
  if (view.source_document_id !== request.source_document_id) {
    throw new Error("rosetta_source_document_identity_mismatch");
  }
  if (
    request.extraction_run_id !== undefined
    && view.extraction_run_id !== request.extraction_run_id
  ) {
    throw new Error("rosetta_extraction_run_identity_mismatch");
  }
  const expected_run_id = String(view.extraction_run_id);
  if (view.law_view.objects.some(object => object.extractionRunId !== expected_run_id)) {
    throw new Error("rosetta_object_extraction_run_mismatch");
  }
  if (view.run_status?.toLowerCase() !== "completed") {
    throw new Error("rosetta_extraction_not_completed");
  }
  if (view.admissibility_state !== "admissible") {
    throw new Error("rosetta_extraction_not_admissible");
  }
  if (view.law_view.provenanceState !== "complete") {
    throw new Error("rosetta_provenance_not_complete");
  }
  if (verification_state(view) !== "complete") {
    throw new Error("rosetta_five_layer_coverage_not_terminal");
  }
  if (view.law_view.objects.length === 0) {
    throw new Error("rosetta_completed_run_has_no_objects");
  }

  const required_receipts = [
    view.engine_version,
    view.rule_set_version,
    view.rule_manifest_hash,
    view.configuration_hash,
    view.source_identity_hash,
    view.source_content_hash,
    view.output_content_hash,
    view.source_url,
    view.source_version,
  ];
  if (required_receipts.some(value => !value)) {
    throw new Error("rosetta_admissible_run_missing_receipt");
  }

  for (const object of view.law_view.objects) {
    if (!object.sourceBlockId) throw new Error("rosetta_object_source_block_missing");
    const source_span = object.metadata?.source_span;
    if (!is_record(source_span)) throw new Error("rosetta_object_source_span_missing");
    if (
      typeof source_span.char_offset_start !== "number"
      || typeof source_span.char_offset_end !== "number"
      || typeof source_span.block_content_hash !== "string"
    ) {
      throw new Error("rosetta_object_source_span_invalid");
    }
  }
}

async function load_view(
  request: rosetta_genome_assembly_request,
): Promise<civic_genome_rosetta_law_view> {
  const view = request.extraction_run_id === undefined
    ? await get_latest_rosetta_law_view_by_source_document(request.source_document_id)
    : await get_rosetta_law_view_by_extraction_run(request.extraction_run_id);
  if (!view) throw new Error("rosetta_law_view_not_found");
  assert_view_identity(request, view);
  return view;
}

async function bind_source_identity(
  client: PoolClient,
  genome_bill_id: string,
  view: civic_genome_rosetta_law_view,
): Promise<void> {
  await client.query(
    `insert into public.civic_genome_rosetta_source_binding (
       source_document_id, genome_bill_id, source_identity_hash,
       source_content_hash, source_url, source_version,
       rosetta_engine_version, rosetta_rule_set_version,
       rosetta_rule_manifest_hash, rosetta_configuration_hash,
       rosetta_output_content_hash
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (source_document_id) do nothing`,
    [
      view.source_document_id,
      genome_bill_id,
      view.source_identity_hash,
      view.source_content_hash,
      view.source_url,
      view.source_version,
      view.engine_version,
      view.rule_set_version,
      view.rule_manifest_hash,
      view.configuration_hash,
      view.output_content_hash,
    ],
  );
  const { rows } = await client.query<{
    genome_bill_id: string;
    source_identity_hash: string;
    source_content_hash: string | null;
    source_url: string | null;
    source_version: string | null;
    rosetta_engine_version: string | null;
    rosetta_rule_set_version: string | null;
    rosetta_rule_manifest_hash: string | null;
    rosetta_configuration_hash: string | null;
    rosetta_output_content_hash: string | null;
  }>(
    `select genome_bill_id, source_identity_hash, source_content_hash,
            source_url, source_version, rosetta_engine_version,
            rosetta_rule_set_version, rosetta_rule_manifest_hash,
            rosetta_configuration_hash, rosetta_output_content_hash
       from public.civic_genome_rosetta_source_binding
      where source_document_id = $1`,
    [view.source_document_id],
  );
  const binding = rows[0];
  if (!binding || binding.genome_bill_id !== genome_bill_id) {
    throw new Error("rosetta_source_document_already_bound_to_other_bill");
  }
  const observed_receipt = {
    source_identity_hash: binding.source_identity_hash,
    source_content_hash: binding.source_content_hash,
    source_url: binding.source_url,
    source_version: binding.source_version,
    rosetta_engine_version: binding.rosetta_engine_version,
    rosetta_rule_set_version: binding.rosetta_rule_set_version,
    rosetta_rule_manifest_hash: binding.rosetta_rule_manifest_hash,
    rosetta_configuration_hash: binding.rosetta_configuration_hash,
    rosetta_output_content_hash: binding.rosetta_output_content_hash,
  };
  const expected_receipt = {
    source_identity_hash: view.source_identity_hash,
    source_content_hash: view.source_content_hash,
    source_url: view.source_url,
    source_version: view.source_version,
    rosetta_engine_version: view.engine_version,
    rosetta_rule_set_version: view.rule_set_version,
    rosetta_rule_manifest_hash: view.rule_manifest_hash,
    rosetta_configuration_hash: view.configuration_hash,
    rosetta_output_content_hash: view.output_content_hash,
  };
  if (hashValue(observed_receipt) !== hashValue(expected_receipt)) {
    throw new Error("rosetta_source_binding_receipt_changed");
  }
}

export async function assemble_rosetta_structural_dna(
  request: rosetta_genome_assembly_request,
): Promise<rosetta_genome_assembly_result> {
  const view = await load_view(request);
  const source_identity = {
    source_document_id: view.source_document_id,
    corpus_id: view.corpus_id,
    document_identifier: view.document_identifier,
    document_name: view.document_name,
    document_type: view.document_type,
    source_identity_hash: view.source_identity_hash,
    source_content_hash: view.source_content_hash,
    source_byte_hash: view.source_byte_hash,
    source_url: view.source_url,
    source_version: view.source_version,
    media_type: view.media_type,
  };
  const source_identity_hash = view.source_identity_hash as string;
  const source_receipt = {
    engine_version: view.engine_version,
    rule_set_version: view.rule_set_version,
    rule_manifest_hash: view.rule_manifest_hash,
    configuration_hash: view.configuration_hash,
    source_identity_hash,
    source_content_hash: view.source_content_hash,
    source_byte_hash: view.source_byte_hash,
    source_provider_hash: view.source_provider_hash,
    output_content_hash: view.output_content_hash,
    source_url: view.source_url,
    source_version: view.source_version,
  };
  const objects_by_id = new Map(
    view.law_view.objects.map(object => [object.sourceObjectId, object]),
  );
  const traits = adaptRosettaToGenomeTraits(request.genome_bill_id, view.law_view.objects);
  const input_hash = hashValue({
    genome_bill_id: request.genome_bill_id,
    source_identity,
    source_receipt,
    extraction_run_id: view.extraction_run_id,
    run_version: view.run_version,
    law_view: view.law_view,
    engine_version: ROSETTA_GENOME_ENGINE_VERSION,
    rule_version: ROSETTA_GENOME_RULE_VERSION,
  });
  const persisted_traits = traits.map(trait => {
    const source_object = objects_by_id.get(trait.sourceObjectId);
    const source_trace = [{
      source_document_id: request.source_document_id,
      source_object_type: trait.sourceObjectType,
      source_object_id: trait.sourceObjectId,
      source_block_id: trait.sourceBlockId,
      extraction_run_id: trait.extractionRunId,
      source_span: source_object?.metadata?.source_span ?? null,
      rosetta_engine_version: view.engine_version,
      rosetta_rule_set_version: view.rule_set_version,
      rosetta_rule_manifest_hash: view.rule_manifest_hash,
      rosetta_configuration_hash: view.configuration_hash,
      rosetta_source_identity_hash: source_identity_hash,
      rosetta_source_content_hash: view.source_content_hash,
      rosetta_source_byte_hash: view.source_byte_hash,
      rosetta_output_content_hash: view.output_content_hash,
      source_url: view.source_url,
      source_version: view.source_version,
      assembly_engine_version: ROSETTA_GENOME_ENGINE_VERSION,
      trait_map_version: ROSETTA_GENOME_RULE_VERSION,
    }];
    return {
      ...trait,
      source_trace,
      content_hash: hashValue({
        trait_class: trait.traitClass,
        trait_key: trait.traitKey,
        normalized_value: trait.normalizedValue,
        source_object_type: trait.sourceObjectType,
        source_object_id: trait.sourceObjectId,
        source_block_id: trait.sourceBlockId,
        extraction_run_id: trait.extractionRunId,
        source_trace,
      }),
    };
  });
  const output_hash = hashValue(persisted_traits);
  const state = verification_state(view);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const bill = await client.query<{ genome_bill_id: string }>(
      `select genome_bill_id from public.civic_genome_bill where genome_bill_id = $1 for update`,
      [request.genome_bill_id],
    );
    if (!bill.rows[0]) throw new Error("civic_genome_bill_not_found");

    await bind_source_identity(client, request.genome_bill_id, view);

    const replay = await client.query<{ assembly_run_id: string }>(
      `select assembly_run_id
         from public.civic_genome_assembly_run
        where genome_bill_id = $1
          and source_document_id = $2
          and extraction_run_id = $3
          and engine_version = $4
          and rule_version = $5
          and input_hash = $6
        limit 1`,
      [
        request.genome_bill_id,
        request.source_document_id,
        String(view.extraction_run_id),
        ROSETTA_GENOME_ENGINE_VERSION,
        ROSETTA_GENOME_RULE_VERSION,
        input_hash,
      ],
    );

    if (replay.rows[0]) {
      await client.query("commit");
      return {
        assembly_run_id: replay.rows[0].assembly_run_id,
        genome_bill_id: request.genome_bill_id,
        source_document_id: request.source_document_id,
        extraction_run_id: String(view.extraction_run_id),
        input_hash,
        output_hash,
        verification_state: state,
        trait_count: persisted_traits.length,
        replayed: true,
      };
    }

    for (const trait of persisted_traits) {
      await client.query(
        `insert into public.civic_genome_trait (
           genome_bill_id, trait_class, trait_key, normalized_value_json,
           source_object_type, source_object_id, source_block_id,
           extraction_run_id, confidence_score, signal_status,
           trait_fingerprint, methodology_version, source_trace,
           source_document_id, verification_state, engine_version,
           rule_version, content_hash
         ) values (
           $1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
           $14,$15,$16,$17,$18
         )
         on conflict (trait_fingerprint) do update set
           normalized_value_json = excluded.normalized_value_json,
           confidence_score = excluded.confidence_score,
           signal_status = excluded.signal_status,
           methodology_version = excluded.methodology_version,
           source_trace = excluded.source_trace,
           source_document_id = excluded.source_document_id,
           verification_state = excluded.verification_state,
           engine_version = excluded.engine_version,
           rule_version = excluded.rule_version,
           content_hash = excluded.content_hash,
           updated_at = now()`,
        [
          trait.genomeBillId,
          trait.traitClass,
          trait.traitKey,
          JSON.stringify(trait.normalizedValue),
          trait.sourceObjectType,
          trait.sourceObjectId,
          trait.sourceBlockId,
          trait.extractionRunId,
          trait.confidence,
          trait.signalStatus,
          trait.traitFingerprint,
          ROSETTA_GENOME_RULE_VERSION,
          JSON.stringify(trait.source_trace),
          request.source_document_id,
          trait.signalStatus,
          view.engine_version,
          view.rule_set_version,
          trait.content_hash,
        ],
      );
    }

    const run = await client.query<{ assembly_run_id: string }>(
      `insert into public.civic_genome_assembly_run (
         genome_bill_id, source_document_id, extraction_run_id,
         engine_version, rule_version, input_hash, output_hash,
         verification_state, coverage_json, trait_count,
         malformed_object_count, run_status, completed_at,
         rosetta_engine_version, rosetta_rule_set_version,
         rosetta_rule_manifest_hash, rosetta_configuration_hash,
         rosetta_source_identity_hash, rosetta_source_content_hash,
         rosetta_output_content_hash, rosetta_source_url,
         rosetta_source_version
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,0,'completed',now(),
         $11,$12,$13,$14,$15,$16,$17,$18,$19
       )
       returning assembly_run_id`,
      [
        request.genome_bill_id,
        request.source_document_id,
        String(view.extraction_run_id),
        ROSETTA_GENOME_ENGINE_VERSION,
        ROSETTA_GENOME_RULE_VERSION,
        input_hash,
        output_hash,
        state,
        JSON.stringify(view.law_view.coverage),
        persisted_traits.length,
        view.engine_version,
        view.rule_set_version,
        view.rule_manifest_hash,
        view.configuration_hash,
        source_identity_hash,
        view.source_content_hash,
        view.output_content_hash,
        view.source_url,
        view.source_version,
      ],
    );

    await client.query(
      `update public.civic_genome_bill
          set rosetta_extraction_run_id = $2,
              structural_dna_hash = $3,
              structural_dna_json = coalesce(structural_dna_json, '{}'::jsonb)
                || jsonb_build_object(
                  'rosetta_source_receipt', $11::jsonb,
                  'rosetta_assembly',
                  jsonb_build_object(
                    'engine_version', $4,
                    'rule_version', $5,
                    'source_document_id', $6,
                    'extraction_run_id', $2,
                    'input_hash', $7,
                    'output_hash', $3,
                    'verification_state', $8,
                    'coverage', $9::jsonb,
                    'trait_count', $10,
                    'rosetta_engine_version', $12,
                    'rosetta_rule_set_version', $13,
                    'rosetta_rule_manifest_hash', $14,
                    'rosetta_configuration_hash', $15,
                    'rosetta_source_content_hash', $16,
                    'rosetta_output_content_hash', $17
                  )
                ),
              updated_at = now()
        where genome_bill_id = $1`,
      [
        request.genome_bill_id,
        String(view.extraction_run_id),
        output_hash,
        ROSETTA_GENOME_ENGINE_VERSION,
        ROSETTA_GENOME_RULE_VERSION,
        request.source_document_id,
        input_hash,
        state,
        JSON.stringify(view.law_view.coverage),
        persisted_traits.length,
        JSON.stringify(source_receipt),
        view.engine_version,
        view.rule_set_version,
        view.rule_manifest_hash,
        view.configuration_hash,
        view.source_content_hash,
        view.output_content_hash,
      ],
    );

    await client.query("commit");
    return {
      assembly_run_id: run.rows[0].assembly_run_id,
      genome_bill_id: request.genome_bill_id,
      source_document_id: request.source_document_id,
      extraction_run_id: String(view.extraction_run_id),
      input_hash,
      output_hash,
      verification_state: state,
      trait_count: persisted_traits.length,
      replayed: false,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
