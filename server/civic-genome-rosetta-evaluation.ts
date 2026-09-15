import { getPool } from "./db";
import { rosetta_evaluation_schema, type RosettaEvaluation } from "../shared/rosetta-evaluation";

const ROSETTA_EVALUATION_TIMEOUT_MS = 10_000;
const ROSETTA_STANDALONE_URL = "https://rosetta-v3-platform.onrender.com";

type version_binding = {
  bill_version_id: string;
  version_type: string;
  source_document_id: number | null;
  source_content_hash: string | null;
};

export type civic_genome_rosetta_evaluation = {
  binding: version_binding | null;
  availability: "available" | "binding_missing" | "not_in_evaluation";
  review_url: string;
  evaluation: RosettaEvaluation | null;
};

/** Observe a saved evaluation of the exact Rosetta source already bound to this version. */
export async function get_civic_genome_rosetta_evaluation(input: {
  genome_bill_id: string;
  bill_version_id?: string;
}): Promise<civic_genome_rosetta_evaluation> {
  const { rows } = await getPool().query<version_binding>(
    `select bill_version_id, version_type,
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
  const base_url = new URL(process.env.ROSETTA_REVIEW_BASE_URL?.trim() || ROSETTA_STANDALONE_URL);
  if (base_url.protocol !== "https:" || base_url.username || base_url.password) {
    throw new Error("invalid_rosetta_review_base_url");
  }
  const review_url = new URL("/review", base_url).toString();
  if (!binding?.source_document_id || !/^[0-9a-f]{64}$/.test(binding.source_content_hash ?? "")) {
    return { binding, availability: "binding_missing", review_url, evaluation: null };
  }
  const url = new URL("/api/review/laws/resolve", base_url);
  url.searchParams.set("source_document_id", String(binding.source_document_id));
  url.searchParams.set("source_content_hash", binding.source_content_hash!);
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
      return { binding, availability: "not_in_evaluation", review_url, evaluation: null };
    }
    if (!response.ok) throw new Error(`rosetta_evaluation_read_failed:${response.status}`);
    const evaluation = rosetta_evaluation_schema.parse(await response.json());
    if (evaluation.status === "passed" && (!evaluation.selected_attempt
      || evaluation.selected_attempt.identity_valid !== true
      || evaluation.selected_attempt.all_validators_pass !== true
      || !(evaluation.selected_attempt.validator_count! > 0))) {
      throw new Error("rosetta_evaluation_pass_evidence_missing");
    }
    if (evaluation.source.source_document_id !== binding.source_document_id
      || evaluation.source.source_content_hash !== binding.source_content_hash
      || (evaluation.selected_attempt && evaluation.selected_attempt.source_registry_id !== evaluation.source.source_registry_id)
      || evaluation.attempts.some(attempt => attempt.source_registry_id !== evaluation.source.source_registry_id)
      || evaluation.law_view?.objects.some(object =>
        String(object.extraction_run_id) !== String(evaluation.selected_attempt?.extraction_run_id))) {
      throw new Error("rosetta_evaluation_source_identity_mismatch");
    }
    const detail_url = new URL(`/review/laws/${encodeURIComponent(evaluation.source.source_registry_id)}`, base_url);
    if (evaluation.selected_attempt) detail_url.searchParams.set("attempt_id", evaluation.selected_attempt.attempt_id);
    return { binding, availability: "available", review_url: detail_url.toString(), evaluation };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_evaluation_read_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
