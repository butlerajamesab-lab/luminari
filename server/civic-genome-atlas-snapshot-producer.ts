import { getPool } from "./db";
import { computeCanonicalHash } from "./lib/determinism";
import {
  assert_civic_genome_external_snapshot_v1,
  civic_genome_external_snapshot_hash_basis,
  type civic_genome_external_snapshot_component_v1,
  type civic_genome_external_snapshot_v1,
  type civic_genome_external_source_binding_v1,
  type civic_genome_external_verification_state_v1,
} from "./civic-genome-external-snapshot-contract";
import {
  produce_civic_genome_family_snapshot_v1,
  type civic_genome_external_snapshot_build_options_v1,
} from "./civic-genome-external-snapshot-producer";

export const CIVIC_GENOME_ATLAS_SNAPSHOT_METHODOLOGY_VERSION =
  "civic_genome_external_family_snapshot.1.1.0" as const;

const BILL_VERSION_SQL = `
select to_jsonb(v) as version
from public.civic_genome_bill_version v
join public.civic_genome_bill b on b.genome_bill_id = v.genome_bill_id
where b.family_id = $1::uuid
  and v.created_at <= $2::timestamptz
  and v.updated_at <= $2::timestamptz
order by v.stage_rank, v.provider_sequence, v.source_document_key, v.bill_version_id
`;

type record_value = Record<string, unknown>;
type version_row = { version: record_value };

function record(value: unknown, label: string): record_value {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`civic_genome_atlas_snapshot_producer:${label}_must_be_object`);
  }
  return value as record_value;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function semantic_record(value: record_value): record_value {
  const output: record_value = {};
  for (const key of Object.keys(value).sort()) {
    if (key === "created_at" || key === "updated_at") continue;
    output[key] = value[key];
  }
  return output;
}

function sort_bindings(bindings: civic_genome_external_source_binding_v1[]) {
  return [...bindings].sort((left, right) =>
    [left.owner_service, left.record_type, left.record_id, left.receipt_id ?? ""].join("\u0000")
      .localeCompare([right.owner_service, right.record_type, right.record_id, right.receipt_id ?? ""].join("\u0000"))
  );
}

function sort_verification(states: civic_genome_external_verification_state_v1[]) {
  return [...states].sort((left, right) =>
    [left.owner_service, left.state, left.receipt_id ?? ""].join("\u0000")
      .localeCompare([right.owner_service, right.state, right.receipt_id ?? ""].join("\u0000"))
  );
}

function component_hash_basis(component: Omit<civic_genome_external_snapshot_component_v1, "component_hash">) {
  return {
    ...component,
    source_bindings: sort_bindings(component.source_bindings),
    source_verification: sort_verification(component.source_verification),
    unresolved_conditions: [...component.unresolved_conditions].sort(),
  };
}

function enrich_bill_component(
  component: civic_genome_external_snapshot_component_v1,
  versions: record_value[],
): civic_genome_external_snapshot_component_v1 {
  const semantic_versions = versions
    .map(semantic_record)
    .sort((left, right) => {
      const stage = Number(left.stage_rank ?? 0) - Number(right.stage_rank ?? 0);
      if (stage !== 0) return stage;
      const sequence = Number(left.provider_sequence ?? 0) - Number(right.provider_sequence ?? 0);
      if (sequence !== 0) return sequence;
      return String(left.source_document_key ?? "").localeCompare(String(right.source_document_key ?? ""));
    });
  const manifest_hash = computeCanonicalHash(semantic_versions);
  const manifest_receipt_id = `cgv-manifest-${manifest_hash.slice(0, 32)}`;

  const value = {
    ...record(component.value, "bill_component_value"),
    bill_versions: semantic_versions,
    bill_version_manifest: {
      manifest_version: "1.0.0",
      ordering_rule: "stage_rank_then_provider_sequence_then_source_document_key",
      version_count: semantic_versions.length,
      manifest_hash,
    },
  };

  const source_bindings = sort_bindings([
    ...component.source_bindings,
    {
      owner_service: "civic_genome",
      record_type: "civic_genome_bill_version_manifest",
      record_id: component.canonical_record_id,
      receipt_id: manifest_receipt_id,
      content_hash: manifest_hash,
      engine_id: "civic_genome_legislative_version_spine",
      engine_version: "1.0.0",
      rule_id: "stage_rank_provider_sequence_source_document_key",
      rule_version: "1.0.0",
    },
  ]);
  const source_verification = sort_verification([
    ...component.source_verification,
    {
      owner_service: "civic_genome",
      state: semantic_versions.some(version => text(version.processing_state) === "failed")
        ? "version_manifest_with_failures"
        : "version_manifest_complete",
      receipt_id: manifest_receipt_id,
      evidence_hash: manifest_hash,
      mapping_state: "source_native_preserved",
    },
  ]);

  const {
    component_hash: _stale_component_hash,
    ...component_without_hash
  } = component;
  const basis = component_hash_basis({
    ...component_without_hash,
    value,
    source_bindings,
    source_verification,
  });
  return {
    ...basis,
    component_hash: computeCanonicalHash(basis),
  };
}

export async function produce_civic_genome_atlas_family_snapshot_v1(
  options: civic_genome_external_snapshot_build_options_v1,
): Promise<civic_genome_external_snapshot_v1> {
  const base = await produce_civic_genome_family_snapshot_v1(options);
  const pool = await getPool();
  const client = await pool.connect();
  let version_rows: version_row[] = [];
  try {
    const result = await client.query<version_row>(BILL_VERSION_SQL, [options.family_id, options.as_of]);
    version_rows = result.rows;
  } finally {
    client.release();
  }

  const versions_by_bill = new Map<string, record_value[]>();
  for (const row of version_rows) {
    const version = record(row.version, "bill_version");
    const genome_bill_id = text(version.genome_bill_id);
    if (!genome_bill_id) throw new Error("civic_genome_atlas_snapshot_producer:bill_version_genome_bill_id_missing");
    const bucket = versions_by_bill.get(genome_bill_id) ?? [];
    bucket.push(version);
    versions_by_bill.set(genome_bill_id, bucket);
  }

  const components = base.components.map(component => {
    if (component.component_type !== "bill") return component;
    return enrich_bill_component(
      component,
      versions_by_bill.get(component.canonical_record_id) ?? [],
    );
  }).sort((left, right) => left.component_id.localeCompare(right.component_id));

  const identity_hash = computeCanonicalHash({
    contract_id: base.contract_id,
    contract_version: base.contract_version,
    family_id: options.family_id,
    as_of: base.as_of,
    methodology_version: CIVIC_GENOME_ATLAS_SNAPSHOT_METHODOLOGY_VERSION,
  });
  const snapshot_id = `cg-family-snapshot-${identity_hash.slice(0, 32)}`;
  const generated_at = base.export_receipt.generated_at;
  const placeholder_hash = "0".repeat(64);
  const provisional: civic_genome_external_snapshot_v1 = {
    ...base,
    snapshot_id,
    methodology_version: CIVIC_GENOME_ATLAS_SNAPSHOT_METHODOLOGY_VERSION,
    components,
    component_count: components.length,
    snapshot_hash: placeholder_hash,
    export_receipt: {
      export_receipt_id: "pending",
      export_receipt_hash: placeholder_hash,
      snapshot_hash: placeholder_hash,
      deterministic_replay_key: placeholder_hash,
      replay_state: "original",
      source_commit_sha: options.source_commit_sha ?? null,
      generated_at,
    },
  };
  const snapshot_hash = computeCanonicalHash(civic_genome_external_snapshot_hash_basis(provisional));
  const deterministic_replay_key = computeCanonicalHash({
    contract_id: provisional.contract_id,
    contract_version: provisional.contract_version,
    snapshot_id,
    snapshot_hash,
    methodology_version: provisional.methodology_version,
  });
  const export_receipt_id = `cg-export-${deterministic_replay_key.slice(0, 32)}`;
  const export_receipt_hash = computeCanonicalHash({
    export_receipt_id,
    snapshot_hash,
    deterministic_replay_key,
    source_commit_sha: options.source_commit_sha ?? null,
  });

  return assert_civic_genome_external_snapshot_v1({
    ...provisional,
    snapshot_hash,
    export_receipt: {
      export_receipt_id,
      export_receipt_hash,
      snapshot_hash,
      deterministic_replay_key,
      replay_state: options.prior_snapshot_hash === snapshot_hash ? "identical_replay" : "original",
      source_commit_sha: options.source_commit_sha ?? null,
      generated_at,
    },
  });
}
