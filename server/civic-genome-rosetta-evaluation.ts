import { getPool } from "./db";
import { rosetta_evaluation_schema, type RosettaEvaluation } from "../shared/rosetta-evaluation";

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
  const base_url = get_rosetta_review_base_url();
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
    const source = evaluation.source;
    const attempt = evaluation.selected_attempt;
    const run_id = attempt?.extraction_run_id;
    if (evaluation.source.source_document_id !== binding.source_document_id
      || evaluation.source.source_content_hash !== binding.source_content_hash
      || (attempt && (attempt.source_registry_id !== source.source_registry_id
        || attempt.source_document_id !== source.source_document_id || attempt.source_content_hash !== source.source_content_hash))
      || evaluation.attempts.some(item => item.source_registry_id !== source.source_registry_id
        || item.source_document_id !== source.source_document_id || item.source_content_hash !== source.source_content_hash)
      || (evaluation.law_view && (evaluation.law_view.extraction_run_id !== run_id
        || evaluation.law_view.source_document_id !== source.source_document_id
        || evaluation.law_view.source_content_hash !== source.source_content_hash
        || evaluation.law_view.engine_version !== attempt?.engine_version
        || evaluation.law_view.rule_set_version !== attempt?.rule_set_version
        || evaluation.law_view.configuration_hash !== attempt?.configuration_hash
        || evaluation.law_view.output_content_hash !== attempt?.output_content_hash))
      || evaluation.law_view?.objects.some(object =>
        String(object.extraction_run_id) !== String(run_id))
      || evaluation.validation_results.some(row => row.extraction_run_id !== run_id)
      || (evaluation.extraction_manifest && (evaluation.extraction_manifest.extraction_run_id !== run_id
        || evaluation.extraction_manifest.source_document_id !== source.source_document_id
        || evaluation.extraction_manifest.source_content_id !== source.source_content_id
        || evaluation.extraction_manifest.source_hash !== source.source_content_hash
        || evaluation.extraction_manifest.engine_version !== attempt?.engine_version
        || evaluation.extraction_manifest.rule_set_version !== attempt?.rule_set_version
        || evaluation.extraction_manifest.configuration_hash !== attempt?.configuration_hash
        || evaluation.extraction_manifest.output_hash !== attempt?.output_content_hash))
      || (evaluation.source_receipt && (evaluation.source_receipt.source_document_id !== source.source_document_id
        || evaluation.source_receipt.source_content_id !== source.source_content_id
        || evaluation.source_receipt.source_content_hash !== source.source_content_hash))) {
      throw new Error("rosetta_evaluation_source_identity_mismatch");
    }
    if (evaluation.status === "passed") {
      const version = /^rosetta-v3-deterministic-sql-(2\.5\.(?:28|29|30|32|33))$/.exec(attempt?.engine_version ?? "")?.[1];
      const suffix = version?.replaceAll(".", "");
      const expected = ["canonical_rows_source_bound", `exact_source_structure_v${suffix}`, "five_layer_coverage",
        `independent_structure_v${suffix}`, "no_pending_coverage", "output_hash_verified", "source_bytes_receipted",
        "source_hash_verified", "structural_correctness_v2"].sort();
      if (!version || !evaluation.law_view || !evaluation.extraction_manifest || !evaluation.source_receipt
        || evaluation.validation_results.length !== 9
        || JSON.stringify(evaluation.validation_results.map(row => row.test_name).sort()) !== JSON.stringify(expected)
        || evaluation.validation_results.some(row => row.test_result !== "pass" || row.failure_count !== 0)) {
        throw new Error("rosetta_evaluation_pass_evidence_missing");
      }
    }
    const detail_url = new URL(`/review/${encodeURIComponent(source.source_registry_id)}${attempt ? `/${encodeURIComponent(attempt.attempt_id)}` : ""}`, base_url);
    return { binding, availability: "available", review_url: detail_url.toString(), evaluation };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("rosetta_evaluation_read_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
