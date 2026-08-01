import { createHash } from "node:crypto";

import { getPool } from "./db";
import { resolve_or_assemble_docket_bill } from "./civic-genome-single-bill-assembly";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

const ROSETTA_CORPUS_NAME = "Lighthouse Docket";
const ROSETTA_CORPUS_TYPE = "legislative";

export type rosetta_source_ingestion_result = {
  source_bill_id: number;
  genome_bill_id: string;
  corpus_id: number;
  source_document_id: number;
  extraction_run_id: number;
  source_document_status: "existing" | "created";
  extraction_run_status: "existing" | "created";
  run_status: string;
  source_hash: string;
};

type genome_bill_source = {
  genome_bill_id: string;
  source_bill_number: string;
  source_bill_title: string | null;
  structural_dna_json: Record<string, unknown> | null;
};

type rosetta_row = Record<string, unknown>;

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value.replace(/\/$/, "");
}

function stable_hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function rosetta_request(
  path: string,
  init: RequestInit,
): Promise<rosetta_row[]> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key, init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const response = await fetch(`${base_url}/rest/v1/${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const preview = (await response.text()).slice(0, 500);
    throw new Error(`rosetta_source_ingestion_failed:${response.status}:${preview}`);
  }

  if (response.status === 204) return [];
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("invalid_rosetta_source_ingestion_response");
  return payload as rosetta_row[];
}

async function load_genome_bill(source_bill_id: number): Promise<genome_bill_source> {
  const result = await getPool().query<genome_bill_source>(
    `select genome_bill_id,
            source_bill_number,
            source_bill_title,
            structural_dna_json
       from public.civic_genome_bill
      where structural_dna_json ->> 'source_bill_id' = $1
      order by updated_at desc, genome_bill_id
      limit 1`,
    [String(source_bill_id)],
  );
  const row = result.rows[0];
  if (!row) throw new Error("civic_genome_bill_not_found_after_projection");
  return row;
}

async function ensure_rosetta_corpus(): Promise<number> {
  const query = new URLSearchParams({
    select: "id",
    corpus_name: `eq.${ROSETTA_CORPUS_NAME}`,
    corpus_type: `eq.${ROSETTA_CORPUS_TYPE}`,
    limit: "1",
  });
  const existing = await rosetta_request(`corpus?${query.toString()}`, { method: "GET" });
  if (existing[0]?.id !== undefined) return Number(existing[0].id);

  const created = await rosetta_request("corpus", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ corpus_name: ROSETTA_CORPUS_NAME, corpus_type: ROSETTA_CORPUS_TYPE }),
  });
  if (created[0]?.id === undefined) throw new Error("rosetta_corpus_create_missing_id");
  return Number(created[0].id);
}

async function ensure_source_document(
  corpus_id: number,
  source_bill_id: number,
  bill: genome_bill_source,
): Promise<{ id: number; status: "existing" | "created" }> {
  const identifier = String(source_bill_id);
  const query = new URLSearchParams({
    select: "id",
    corpus_id: `eq.${corpus_id}`,
    document_identifier: `eq.${identifier}`,
    limit: "1",
  });
  const existing = await rosetta_request(`source_document?${query.toString()}`, { method: "GET" });
  if (existing[0]?.id !== undefined) return { id: Number(existing[0].id), status: "existing" };

  const created = await rosetta_request("source_document", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      corpus_id,
      document_name: `${bill.source_bill_number}: ${bill.source_bill_title ?? "Untitled bill"}`,
      document_type: "bill",
      document_identifier: identifier,
    }),
  });
  if (created[0]?.id === undefined) throw new Error("rosetta_source_document_create_missing_id");
  return { id: Number(created[0].id), status: "created" };
}

/**
 * Return the latest Rosetta run when one already exists. The deterministic
 * extractor owns replay identity and decides whether a new run is necessary;
 * the Docket handoff must not manufacture a blank run after a completed one.
 */
async function ensure_extraction_run(
  source_document_id: number,
): Promise<{ id: number; status: "existing" | "created"; run_status: string }> {
  const query = new URLSearchParams({
    select: "id,run_status,run_version",
    source_document_id: `eq.${source_document_id}`,
    order: "run_version.desc,id.desc",
    limit: "1",
  });
  const existing = await rosetta_request(`extraction_run?${query.toString()}`, { method: "GET" });
  const latest = existing[0];

  if (latest?.id !== undefined) {
    return {
      id: Number(latest.id),
      status: "existing",
      run_status: String(latest.run_status ?? "unknown").toLowerCase(),
    };
  }

  const created = await rosetta_request("extraction_run", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      source_document_id,
      run_version: 1,
      run_status: "in_progress",
    }),
  });
  if (created[0]?.id === undefined) throw new Error("rosetta_extraction_run_create_missing_id");
  return {
    id: Number(created[0].id),
    status: "created",
    run_status: String(created[0].run_status ?? "in_progress"),
  };
}

/**
 * Creates the authoritative cross-platform source identity for one cached Docket
 * bill. It does not fabricate Rosetta layer objects and does not mark extraction
 * completed. The returned run is the bounded handoff to Rosetta's deterministic
 * extractor; completed runs remain reusable rather than spawning blank successors.
 */
export async function ingest_docket_bill_to_rosetta_source(
  source_bill_id: number,
): Promise<rosetta_source_ingestion_result> {
  const projected = await resolve_or_assemble_docket_bill(source_bill_id);
  if (!projected.ok) throw new Error("docket_bill_not_available_for_rosetta_ingestion");

  const bill = await load_genome_bill(source_bill_id);
  const corpus_id = await ensure_rosetta_corpus();
  const source_document = await ensure_source_document(corpus_id, source_bill_id, bill);
  const extraction_run = await ensure_extraction_run(source_document.id);
  const source_hash = stable_hash({
    source_bill_id,
    genome_bill_id: bill.genome_bill_id,
    source_bill_number: bill.source_bill_number,
    source_bill_title: bill.source_bill_title,
    structural_dna_json: bill.structural_dna_json,
  });

  return {
    source_bill_id,
    genome_bill_id: bill.genome_bill_id,
    corpus_id,
    source_document_id: source_document.id,
    extraction_run_id: extraction_run.id,
    source_document_status: source_document.status,
    extraction_run_status: extraction_run.status,
    run_status: extraction_run.run_status,
    source_hash,
  };
}
