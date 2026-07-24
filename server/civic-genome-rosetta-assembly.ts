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
  source_document_id: number,
  source_identity_hash: string,
): Promise<void> {
  await client.query(
    `insert into public.civic_genome_rosetta_source_binding (
       source_document_id, genome_bill_id, source_identity_hash
     ) values ($1, $2, $3)
     on conflict (source_document_id) do nothing`,
    [source_document_id, genome_bill_id, source_identity_hash],
  );
  const { rows } = await client.query<{ genome_bill_id: string; source_identity_hash: string }>(
    `select genome_bill_id, source_identity_hash
       from public.civic_genome_rosetta_source_binding
      where source_document_id = $1`,
    [source_document_id],
  );
  const binding = rows[0];
  if (!binding || binding.genome_bill_id !== genome_bill_id) {
    throw new Error("rosetta_source_document_already_bound_to_other_bill");
  }
  if (binding.source_identity_hash !== source_identity_hash) {
    throw new Error("rosetta_source_identity_hash_changed");
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
  };
  const source_identity_hash = hashValue(source_identity);
  const traits = adaptRosettaToGenomeTraits(request.genome_bill_id, view.law_view.objects);
  const input_hash = hashValue({
    genome_bill_id: request.genome_bill_id,
    source_identity,
    extraction_run_id: view.extraction_run_id,
    run_version: view.run_version,
    law_view: view.law_view,
    engine_version: ROSETTA_GENOME_ENGINE_VERSION,
    rule_version: ROSETTA_GENOME_RULE_VERSION,
  });
  const persisted_traits = traits.map(trait => ({
    ...trait,
    content_hash: hashValue({
      trait_class: trait.traitClass,
      trait_key: trait.traitKey,
      normalized_value: trait.normalizedValue,
      source_object_type: trait.sourceObjectType,
      source_object_id: trait.sourceObjectId,
      source_block_id: trait.sourceBlockId,
      extraction_run_id: trait.extractionRunId,
    }),
  }));
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

    await bind_source_identity(
      client,
      request.genome_bill_id,
      request.source_document_id,
      source_identity_hash,
    );

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
           verification_state = excluded.verification_state,
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
          JSON.stringify([{
            source_document_id: request.source_document_id,
            source_object_id: trait.sourceObjectId,
            source_block_id: trait.sourceBlockId,
            extraction_run_id: trait.extractionRunId,
          }]),
          request.source_document_id,
          trait.signalStatus,
          ROSETTA_GENOME_ENGINE_VERSION,
          ROSETTA_GENOME_RULE_VERSION,
          trait.content_hash,
        ],
      );
    }

    const run = await client.query<{ assembly_run_id: string }>(
      `insert into public.civic_genome_assembly_run (
         genome_bill_id, source_document_id, extraction_run_id,
         engine_version, rule_version, input_hash, output_hash,
         verification_state, coverage_json, trait_count,
         malformed_object_count, run_status, completed_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,0,'completed',now())
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
      ],
    );

    await client.query(
      `update public.civic_genome_bill
          set rosetta_extraction_run_id = $2,
              structural_dna_hash = $3,
              structural_dna_json = jsonb_build_object(
                'engine_version', $4,
                'rule_version', $5,
                'source_document_id', $6,
                'extraction_run_id', $2,
                'input_hash', $7,
                'output_hash', $3,
                'verification_state', $8,
                'coverage', $9::jsonb,
                'trait_count', $10
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
