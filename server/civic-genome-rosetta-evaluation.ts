import { getPool } from "./db";
import {
  rosetta_public_current_docket_result_schema,
  type RosettaPublicCurrentDocketResult,
} from "../shared/rosetta-public-current-docket-result";

const ROSETTA_EVALUATION_TIMEOUT_MS = 10_000;
const ROSETTA_STANDALONE_URL = "https://rosetta-v3-platform.onrender.com";

export function get_rosetta_review_base_url(): string {
  const url = new URL(process.env.ROSETTA_REVIEW_BASE_URL?.trim() || ROSETTA_STANDALONE_URL);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("invalid_rosetta_review_base_url");
  }
  return url.origin;
}

type version_binding = {
  bill_version_id: string;
  version_type: string;
  source_document_key: string | null;
  source_document_id: number | null;
  source_content_hash: string | null;
};

export type civic_genome_rosetta_evaluation = {
  binding: version_binding | null;
  availability: "available" | "binding_missing" | "not_in_evaluation";
  review_url: string;
  current_docket_result: RosettaPublicCurrentDocketResult | null;
};

function has_hash(value: string | null | undefined): value is string {
  return /^[0-9a-f]{64}$/i.test(value ?? "");
}

function normalized_hash(value: string): string {
  return value.toLowerCase();
}

function assert_current_docket_result_identity(input: {
  current_docket_result: RosettaPublicCurrentDocketResult;
  source_document_key: string;
  source_content_hash: string;
}): void {
  if (input.current_docket_result.docket_source_key !== input.source_document_key) {
    throw new Error("rosetta_public_current_docket_result_source_document_key_mismatch");
  }
  if (
    normalized_hash(input.current_docket_result.source_content_hash)
    !== normalized_hash(input.source_content_hash)
  ) {
    throw new Error("rosetta_public_current_docket_result_source_content_hash_mismatch");
  }
}

export async function load_rosetta_current_docket_result_for_binding(input: {
  source_document_key: string;
  source_content_hash: string;
}): Promise<RosettaPublicCurrentDocketResult | null> {
  const base_url = get_rosetta_review_base_url();
  const url = new URL("/api/public/current-docket-result", base_url);
  url.searchParams.set("source_document_key", input.source_document_key);
  url.searchParams.set("source_content_hash", normalized_hash(input.source_content_hash));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_EVALUATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) throw new Error(`rosetta_public_current_docket_result_read_failed:${response.status}`);
    const current_docket_result = rosetta_public_current_docket_result_schema.parse(await response.json());
    assert_current_docket_result_identity({
      current_docket_result,
      source_document_key: input.source_document_key,
      source_content_hash: input.source_content_hash,
    });
    return current_docket_result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_public_current_docket_result_read_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Observe the exact current Rosetta result bound to this source version. */
export async function get_civic_genome_rosetta_evaluation(input: {
  genome_bill_id: string;
  bill_version_id?: string;
}): Promise<civic_genome_rosetta_evaluation> {
  const { rows } = await getPool().query<version_binding>(
    `select bill_version_id, version_type,
            source_document_key,
            rosetta_source_document_id::integer as source_document_id,
            receipt_json ->> 'source_content_hash' as source_content_hash
       from public.civic_genome_bill_version
      where genome_bill_id = $1::uuid
        and ($2::uuid is null or bill_version_id = $2::uuid)
      order by stage_rank desc, provider_sequence desc, updated_at desc, bill_version_id
      limit 1`,
    [input.genome_bill_id, input.bill_version_id ?? null],
  );
  const binding = rows[0] ?? null;
  const base_url = get_rosetta_review_base_url();
  const review_url = new URL("/review", base_url).toString();
  if (!binding?.source_document_key || !binding.source_document_id || !has_hash(binding.source_content_hash)) {
    return { binding, availability: "binding_missing", review_url, current_docket_result: null };
  }
  const current_docket_result = await load_rosetta_current_docket_result_for_binding({
    source_document_key: binding.source_document_key,
    source_content_hash: binding.source_content_hash,
  });
  if (!current_docket_result) {
    return { binding, availability: "not_in_evaluation", review_url, current_docket_result: null };
  }
  return {
    binding,
    availability: "available",
    review_url: current_docket_result.source_registry_id
      ? new URL(`/review/${encodeURIComponent(current_docket_result.source_registry_id)}`, base_url).toString()
      : review_url,
    current_docket_result,
  };
}
