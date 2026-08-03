export const CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID = "civic_genome.external_snapshot.v1" as const;
export const CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION = "1.0.0" as const;

export const CIVIC_GENOME_EXTERNAL_COMPONENT_TYPES = [
  "family",
  "bill",
  "trait",
  "relationship",
  "lineage_edge",
  "event",
  "momentum_component",
  "momentum_snapshot",
  "comparison_matrix",
  "comparison_state_cell",
  "unresolved_family_candidate",
] as const;

export type civic_genome_external_component_type = typeof CIVIC_GENOME_EXTERNAL_COMPONENT_TYPES[number];
export type civic_genome_external_inclusion_state = "current" | "historical" | "unresolved" | "rejected";
export type civic_genome_external_completeness_state = "complete" | "bounded_complete" | "incomplete";

export type civic_genome_external_source_binding_v1 = {
  owner_service: "docket" | "rosetta" | "atlas" | "prism" | "civic_genome";
  record_type: string;
  record_id: string;
  receipt_id: string | null;
  content_hash: string | null;
  engine_id: string | null;
  engine_version: string | null;
  rule_id: string | null;
  rule_version: string | null;
};

export type civic_genome_external_verification_state_v1 = {
  owner_service: "docket" | "rosetta" | "atlas" | "prism" | "civic_genome";
  state: string;
  receipt_id: string | null;
  evidence_hash: string | null;
  mapping_state: "source_native_preserved";
};

export type civic_genome_external_snapshot_component_v1 = {
  component_id: string;
  component_type: civic_genome_external_component_type;
  canonical_record_id: string;
  inclusion_state: civic_genome_external_inclusion_state;
  jurisdiction_code: string | null;
  temporal_scope: string | null;
  value: unknown;
  source_bindings: civic_genome_external_source_binding_v1[];
  source_verification: civic_genome_external_verification_state_v1[];
  unresolved_conditions: string[];
  component_hash: string;
};

export type civic_genome_external_snapshot_scope_v1 = {
  scope_type: "bill" | "family" | "jurisdiction" | "comparison_matrix" | "bounded_set";
  scope_ids: string[];
  jurisdiction_codes: string[];
};

export type civic_genome_external_snapshot_receipt_v1 = {
  export_receipt_id: string;
  export_receipt_hash: string;
  snapshot_hash: string;
  deterministic_replay_key: string;
  replay_state: "original" | "identical_replay";
  source_commit_sha: string | null;
  generated_at: string;
};

export type civic_genome_external_snapshot_v1 = {
  contract_id: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID;
  contract_version: typeof CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION;
  canonical_owner: "lighthouse/civic_genome";
  snapshot_id: string;
  snapshot_kind: "baseline_export";
  immutable: true;
  scope: civic_genome_external_snapshot_scope_v1;
  as_of: string;
  methodology_version: string;
  components: civic_genome_external_snapshot_component_v1[];
  component_count: number;
  unresolved_conditions: string[];
  excluded_component_types: civic_genome_external_component_type[];
  completeness_state: civic_genome_external_completeness_state;
  snapshot_hash: string;
  export_receipt: civic_genome_external_snapshot_receipt_v1;
};

const HEX64 = /^[0-9a-f]{64}$/;
const COMPONENT_TYPE_SET = new Set<string>(CIVIC_GENOME_EXTERNAL_COMPONENT_TYPES);
const OWNER_SET = new Set(["docket", "rosetta", "atlas", "prism", "civic_genome"]);

function fail(message: string): never {
  throw new Error(`invalid_civic_genome_external_snapshot: ${message}`);
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function require_record(value: unknown, label: string): Record<string, unknown> {
  if (!is_record(value)) fail(`${label} must be an object`);
  return value;
}

function require_string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function require_nullable_string(value: unknown, label: string): string | null {
  if (value === null) return null;
  return require_string(value, label);
}

function require_string_array(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value.map((entry, index) => require_string(entry, `${label}[${index}]`));
}

function require_hex64(value: unknown, label: string): string {
  const text = require_string(value, label);
  if (!HEX64.test(text)) fail(`${label} must be a lowercase SHA-256 hex digest`);
  return text;
}

function require_iso_time(value: unknown, label: string): string {
  const text = require_string(value, label);
  if (!Number.isFinite(Date.parse(text))) fail(`${label} must be an ISO timestamp`);
  return text;
}

function assert_unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must contain unique values`);
}

function validate_source_binding(value: unknown, label: string): civic_genome_external_source_binding_v1 {
  const row = require_record(value, label);
  const owner_service = require_string(row.owner_service, `${label}.owner_service`);
  if (!OWNER_SET.has(owner_service)) fail(`${label}.owner_service is not governed`);
  const record_type = require_string(row.record_type, `${label}.record_type`);
  if (record_type === "civic_genome_projection_checkpoint") {
    fail(`${label} may not use mutable civic_genome_projection_checkpoint continuation state as an external snapshot source`);
  }
  return {
    owner_service: owner_service as civic_genome_external_source_binding_v1["owner_service"],
    record_type,
    record_id: require_string(row.record_id, `${label}.record_id`),
    receipt_id: require_nullable_string(row.receipt_id, `${label}.receipt_id`),
    content_hash: row.content_hash === null ? null : require_hex64(row.content_hash, `${label}.content_hash`),
    engine_id: require_nullable_string(row.engine_id, `${label}.engine_id`),
    engine_version: require_nullable_string(row.engine_version, `${label}.engine_version`),
    rule_id: require_nullable_string(row.rule_id, `${label}.rule_id`),
    rule_version: require_nullable_string(row.rule_version, `${label}.rule_version`),
  };
}

function validate_verification(value: unknown, label: string): civic_genome_external_verification_state_v1 {
  const row = require_record(value, label);
  const owner_service = require_string(row.owner_service, `${label}.owner_service`);
  if (!OWNER_SET.has(owner_service)) fail(`${label}.owner_service is not governed`);
  if (row.mapping_state !== "source_native_preserved") fail(`${label}.mapping_state must preserve source-native verification`);
  return {
    owner_service: owner_service as civic_genome_external_verification_state_v1["owner_service"],
    state: require_string(row.state, `${label}.state`),
    receipt_id: require_nullable_string(row.receipt_id, `${label}.receipt_id`),
    evidence_hash: row.evidence_hash === null ? null : require_hex64(row.evidence_hash, `${label}.evidence_hash`),
    mapping_state: "source_native_preserved",
  };
}

function validate_component(value: unknown, index: number): civic_genome_external_snapshot_component_v1 {
  const label = `components[${index}]`;
  const row = require_record(value, label);
  const component_id = require_string(row.component_id, `${label}.component_id`);
  if (!component_id.startsWith("civic_genome:")) fail(`${label}.component_id must use the civic_genome namespace`);
  const component_type = require_string(row.component_type, `${label}.component_type`);
  if (!COMPONENT_TYPE_SET.has(component_type)) fail(`${label}.component_type is not governed`);
  const inclusion_state = require_string(row.inclusion_state, `${label}.inclusion_state`);
  if (!new Set(["current", "historical", "unresolved", "rejected"]).has(inclusion_state)) {
    fail(`${label}.inclusion_state is not governed`);
  }
  if (!Array.isArray(row.source_bindings) || row.source_bindings.length === 0) {
    fail(`${label}.source_bindings must preserve at least one source`);
  }
  if (!Array.isArray(row.source_verification) || row.source_verification.length === 0) {
    fail(`${label}.source_verification must preserve at least one source-native state`);
  }
  return {
    component_id,
    component_type: component_type as civic_genome_external_component_type,
    canonical_record_id: require_string(row.canonical_record_id, `${label}.canonical_record_id`),
    inclusion_state: inclusion_state as civic_genome_external_inclusion_state,
    jurisdiction_code: require_nullable_string(row.jurisdiction_code, `${label}.jurisdiction_code`),
    temporal_scope: require_nullable_string(row.temporal_scope, `${label}.temporal_scope`),
    value: row.value,
    source_bindings: row.source_bindings.map((entry, binding_index) => validate_source_binding(entry, `${label}.source_bindings[${binding_index}]`)),
    source_verification: row.source_verification.map((entry, verification_index) => validate_verification(entry, `${label}.source_verification[${verification_index}]`)),
    unresolved_conditions: require_string_array(row.unresolved_conditions, `${label}.unresolved_conditions`),
    component_hash: require_hex64(row.component_hash, `${label}.component_hash`),
  };
}

export function assert_civic_genome_external_snapshot_v1(value: unknown): civic_genome_external_snapshot_v1 {
  const row = require_record(value, "snapshot");
  if (row.contract_id !== CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID) fail("contract_id mismatch");
  if (row.contract_version !== CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION) fail("contract_version mismatch");
  if (row.canonical_owner !== "lighthouse/civic_genome") fail("canonical_owner mismatch");
  if (row.snapshot_kind !== "baseline_export") fail("snapshot_kind mismatch");
  if (row.immutable !== true) fail("snapshot must be immutable");

  const scope_row = require_record(row.scope, "scope");
  const scope_type = require_string(scope_row.scope_type, "scope.scope_type");
  if (!new Set(["bill", "family", "jurisdiction", "comparison_matrix", "bounded_set"]).has(scope_type)) {
    fail("scope.scope_type is not governed");
  }
  const scope_ids = require_string_array(scope_row.scope_ids, "scope.scope_ids");
  if (scope_ids.length === 0) fail("scope.scope_ids must not be empty");
  assert_unique(scope_ids, "scope.scope_ids");
  const jurisdiction_codes = require_string_array(scope_row.jurisdiction_codes, "scope.jurisdiction_codes");
  assert_unique(jurisdiction_codes, "scope.jurisdiction_codes");

  if (!Array.isArray(row.components)) fail("components must be an array");
  const components = row.components.map(validate_component);
  const component_ids = components.map(component => component.component_id);
  assert_unique(component_ids, "component_id values");
  if (!Number.isInteger(row.component_count) || row.component_count !== components.length) {
    fail("component_count must equal components.length");
  }

  const completeness_state = require_string(row.completeness_state, "completeness_state");
  if (!new Set(["complete", "bounded_complete", "incomplete"]).has(completeness_state)) {
    fail("completeness_state is not governed");
  }
  const unresolved_conditions = require_string_array(row.unresolved_conditions, "unresolved_conditions");
  if (completeness_state === "incomplete" && unresolved_conditions.length === 0) {
    fail("incomplete snapshots must state unresolved conditions");
  }
  const excluded_component_types = require_string_array(row.excluded_component_types, "excluded_component_types");
  for (const type of excluded_component_types) {
    if (!COMPONENT_TYPE_SET.has(type)) fail(`excluded component type is not governed: ${type}`);
  }
  assert_unique(excluded_component_types, "excluded_component_types");

  const snapshot_hash = require_hex64(row.snapshot_hash, "snapshot_hash");
  const receipt_row = require_record(row.export_receipt, "export_receipt");
  const receipt_snapshot_hash = require_hex64(receipt_row.snapshot_hash, "export_receipt.snapshot_hash");
  if (snapshot_hash !== receipt_snapshot_hash) fail("export receipt snapshot hash mismatch");
  const replay_state = require_string(receipt_row.replay_state, "export_receipt.replay_state");
  if (!new Set(["original", "identical_replay"]).has(replay_state)) fail("export_receipt.replay_state is not governed");

  return {
    contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    canonical_owner: "lighthouse/civic_genome",
    snapshot_id: require_string(row.snapshot_id, "snapshot_id"),
    snapshot_kind: "baseline_export",
    immutable: true,
    scope: {
      scope_type: scope_type as civic_genome_external_snapshot_scope_v1["scope_type"],
      scope_ids,
      jurisdiction_codes,
    },
    as_of: require_iso_time(row.as_of, "as_of"),
    methodology_version: require_string(row.methodology_version, "methodology_version"),
    components,
    component_count: components.length,
    unresolved_conditions,
    excluded_component_types: excluded_component_types as civic_genome_external_component_type[],
    completeness_state: completeness_state as civic_genome_external_completeness_state,
    snapshot_hash,
    export_receipt: {
      export_receipt_id: require_string(receipt_row.export_receipt_id, "export_receipt.export_receipt_id"),
      export_receipt_hash: require_hex64(receipt_row.export_receipt_hash, "export_receipt.export_receipt_hash"),
      snapshot_hash: receipt_snapshot_hash,
      deterministic_replay_key: require_hex64(receipt_row.deterministic_replay_key, "export_receipt.deterministic_replay_key"),
      replay_state: replay_state as civic_genome_external_snapshot_receipt_v1["replay_state"],
      source_commit_sha: require_nullable_string(receipt_row.source_commit_sha, "export_receipt.source_commit_sha"),
      generated_at: require_iso_time(receipt_row.generated_at, "export_receipt.generated_at"),
    },
  };
}

function sort_bindings(bindings: civic_genome_external_source_binding_v1[]): civic_genome_external_source_binding_v1[] {
  return [...bindings].sort((a, b) =>
    [a.owner_service, a.record_type, a.record_id, a.receipt_id ?? ""].join("\u0000")
      .localeCompare([b.owner_service, b.record_type, b.record_id, b.receipt_id ?? ""].join("\u0000"))
  );
}

function sort_verification(states: civic_genome_external_verification_state_v1[]): civic_genome_external_verification_state_v1[] {
  return [...states].sort((a, b) =>
    [a.owner_service, a.state, a.receipt_id ?? ""].join("\u0000")
      .localeCompare([b.owner_service, b.state, b.receipt_id ?? ""].join("\u0000"))
  );
}

export function civic_genome_external_snapshot_hash_basis(snapshot: civic_genome_external_snapshot_v1) {
  return {
    contract_id: snapshot.contract_id,
    contract_version: snapshot.contract_version,
    canonical_owner: snapshot.canonical_owner,
    snapshot_id: snapshot.snapshot_id,
    snapshot_kind: snapshot.snapshot_kind,
    immutable: snapshot.immutable,
    scope: {
      scope_type: snapshot.scope.scope_type,
      scope_ids: [...snapshot.scope.scope_ids].sort(),
      jurisdiction_codes: [...snapshot.scope.jurisdiction_codes].sort(),
    },
    as_of: snapshot.as_of,
    methodology_version: snapshot.methodology_version,
    components: [...snapshot.components]
      .sort((a, b) => a.component_id.localeCompare(b.component_id))
      .map(component => ({
        ...component,
        source_bindings: sort_bindings(component.source_bindings),
        source_verification: sort_verification(component.source_verification),
        unresolved_conditions: [...component.unresolved_conditions].sort(),
      })),
    component_count: snapshot.component_count,
    unresolved_conditions: [...snapshot.unresolved_conditions].sort(),
    excluded_component_types: [...snapshot.excluded_component_types].sort(),
    completeness_state: snapshot.completeness_state,
  };
}
