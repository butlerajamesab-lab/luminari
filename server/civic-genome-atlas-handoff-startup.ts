import { produce_current_civic_genome_atlas_family_snapshot_v1 } from "./civic-genome-atlas-snapshot-producer";
import { deliver_civic_genome_snapshot_to_atlas_v1 } from "./civic-genome-atlas-handoff";

export type civic_genome_atlas_handoff_configuration = {
  family_id: string;
  as_of: string;
  url: string;
  key_id: string;
  secret: string;
};

const REQUIRED = [
  "CIVIC_GENOME_ATLAS_HANDOFF_FAMILY_ID",
  "CIVIC_GENOME_ATLAS_HANDOFF_AS_OF",
  "ATLAS_CIVIC_GENOME_HANDSHAKE_URL",
  "ATLAS_CIVIC_GENOME_HANDSHAKE_KEY_ID",
  "ATLAS_CIVIC_GENOME_HANDSHAKE_SECRET",
] as const;

export function civic_genome_atlas_handoff_configuration_from_environment(
  environment: Record<string, string | undefined> = process.env,
): civic_genome_atlas_handoff_configuration | null {
  const present = REQUIRED.filter(name => Boolean(environment[name]?.trim()));
  if (present.length === 0) return null;
  if (present.length !== REQUIRED.length) {
    throw new Error("civic_genome_atlas_handoff_requires_complete_configuration");
  }
  const as_of = new Date(environment.CIVIC_GENOME_ATLAS_HANDOFF_AS_OF!);
  if (!Number.isFinite(as_of.getTime())) throw new Error("civic_genome_atlas_handoff_as_of_invalid");
  const url = environment.ATLAS_CIVIC_GENOME_HANDSHAKE_URL!.trim();
  if (!url.startsWith("https://") || !url.endsWith("/v1/civic-genome/snapshots")) {
    throw new Error("civic_genome_atlas_handoff_url_invalid");
  }
  return {
    family_id: environment.CIVIC_GENOME_ATLAS_HANDOFF_FAMILY_ID!.trim(),
    as_of: as_of.toISOString(),
    url,
    key_id: environment.ATLAS_CIVIC_GENOME_HANDSHAKE_KEY_ID!.trim(),
    secret: environment.ATLAS_CIVIC_GENOME_HANDSHAKE_SECRET!,
  };
}

export async function run_civic_genome_atlas_handoff_from_environment(
  environment: Record<string, string | undefined> = process.env,
) {
  const configuration = civic_genome_atlas_handoff_configuration_from_environment(environment);
  if (!configuration) return null;
  const source_commit_sha = process.env.RENDER_GIT_COMMIT ?? null;

  console.log("[CivicGenomeAtlasHandoff] started", {
    family_id: configuration.family_id,
    configured_as_of: configuration.as_of,
    source_commit_sha,
  });

  const snapshot = await produce_current_civic_genome_atlas_family_snapshot_v1({
    family_id: configuration.family_id,
    as_of_floor: configuration.as_of,
    source_commit_sha,
    generated_at: new Date().toISOString(),
  });
  const receipt = await deliver_civic_genome_snapshot_to_atlas_v1({
    snapshot,
    url: configuration.url,
    key_id: configuration.key_id,
    secret: configuration.secret,
  });
  console.log("[CivicGenomeAtlasHandoff] completed", {
    family_id: configuration.family_id,
    configured_as_of: configuration.as_of,
    effective_as_of: snapshot.as_of,
    source_commit_sha,
    source_snapshot_id: receipt.source_snapshot_id,
    source_snapshot_hash: receipt.source_snapshot_hash,
    source_export_receipt_id: receipt.source_export_receipt_id,
    source_export_receipt_hash: receipt.source_export_receipt_hash,
    source_component_count: receipt.source_component_count,
    delivery_receipt_id: receipt.delivery_receipt_id,
    delivery_receipt_hash: receipt.delivery_receipt_hash,
    validation_state: receipt.validation_state,
    verification_mapping_state: receipt.verification_mapping_state,
    persistence_status: receipt.persistence_status,
    persisted: receipt.persisted,
    projection_executed: receipt.projection_executed,
  });
  return receipt;
}
