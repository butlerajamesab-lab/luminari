import { create_rosetta_supabase_headers } from "../rosetta-supabase-auth";

type rosetta_publication_binding = {
  source_document_id: number;
  extraction_run_id: string;
  rosetta_source_identity_hash: string;
  rosetta_source_content_hash: string;
  rosetta_output_content_hash: string;
  rosetta_rule_manifest_hash: string;
  rosetta_configuration_hash: string;
};

const hash_bindings = [
  ["source_identity_hash", "rosetta_source_identity_hash"],
  ["source_content_hash", "rosetta_source_content_hash"],
  ["output_content_hash", "rosetta_output_content_hash"],
  ["rule_manifest_hash", "rosetta_rule_manifest_hash"],
  ["configuration_hash", "rosetta_configuration_hash"],
] as const;

/** Ask Rosetta's owned publication view; never reproduce its policy in Lighthouse. */
export async function assert_rosetta_current_publication(
  binding: rosetta_publication_binding,
): Promise<void> {
  const base_url = process.env.ROSETTA_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const service_key = process.env.ROSETTA_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base_url || !service_key) throw new Error("prism_rosetta_publication_backend_unconfigured");
  const extraction_run_id = Number(binding.extraction_run_id);
  if (!/^[1-9][0-9]*$/.test(binding.extraction_run_id) ||
      !Number.isSafeInteger(extraction_run_id) || extraction_run_id > 2_147_483_647) {
    throw new Error("prism_rosetta_publication_run_id_invalid");
  }
  const query = new URLSearchParams({
    select: "extraction_run_id,source_document_id," + hash_bindings.map(([column]) => column).join(","),
    extraction_run_id: `eq.${extraction_run_id}`,
    source_document_id: `eq.${binding.source_document_id}`,
    limit: "2",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base_url}/rest/v1/v_civic_genome_law_view_v1?${query}`, {
      method: "GET",
      headers: create_rosetta_supabase_headers(service_key, { accept: "application/json" }),
      signal: controller.signal,
    }).catch(() => { throw new Error("prism_rosetta_publication_lookup_network_failure"); });
    if (!response.ok) throw new Error(`prism_rosetta_publication_lookup_failed:${response.status}`);
    const rows: unknown = await response.json().catch(() => {
      throw new Error("prism_rosetta_publication_lookup_invalid_response");
    });
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new Error("prism_rosetta_publication_lookup_invalid_response");
    }
    if (rows.length === 0) {
      throw new Error("prism_rosetta_current_publication_not_eligible");
    }
    const row = rows[0];
    if (!row || typeof row !== "object" ||
        row.extraction_run_id !== extraction_run_id ||
        row.source_document_id !== binding.source_document_id ||
        hash_bindings.some(([column, field]) =>
          typeof row[column] !== "string" ||
          row[column].toLowerCase() !== binding[field].toLowerCase())) {
      throw new Error("prism_rosetta_current_publication_binding_mismatch");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("prism_rosetta_publication_lookup_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
