import { getPool } from "./db";
import { computeCanonicalHash } from "./lib/determinism";
import {
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
  CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
  assert_civic_genome_external_snapshot_v1,
  civic_genome_external_snapshot_hash_basis,
  type civic_genome_external_snapshot_component_v1,
  type civic_genome_external_snapshot_v1,
  type civic_genome_external_source_binding_v1,
  type civic_genome_external_verification_state_v1,
} from "./civic-genome-external-snapshot-contract";

export const CIVIC_GENOME_EXTERNAL_SNAPSHOT_METHODOLOGY_VERSION =
  "civic_genome_external_family_snapshot.1.0.0" as const;

const HEX64 = /^[0-9a-f]{64}$/;

export const CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL = `
select jsonb_build_object(
  'family', to_jsonb(f),
  'bills', coalesce((
    select jsonb_agg(to_jsonb(b) order by b.genome_bill_id)
    from public.civic_genome_bill b
    where b.family_id = f.family_id
      and b.created_at <= $2::timestamptz
      and b.updated_at <= $2::timestamptz
  ), '[]'::jsonb),
  'traits', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'trait', to_jsonb(t),
        'prism_bindings', coalesce((
          select jsonb_agg(to_jsonb(pvb) order by pvb.binding_id)
          from public.civic_genome_prism_verification_binding pvb
          where pvb.trait_id = t.trait_id
            and pvb.created_at <= $2::timestamptz
        ), '[]'::jsonb)
      )
      order by t.trait_id
    )
    from public.civic_genome_trait t
    join public.civic_genome_bill tb on tb.genome_bill_id = t.genome_bill_id
    where tb.family_id = f.family_id
      and t.created_at <= $2::timestamptz
      and t.updated_at <= $2::timestamptz
  ), '[]'::jsonb),
  'events', coalesce((
    select jsonb_agg(to_jsonb(e) order by e.event_timestamp, e.event_id)
    from public.civic_genome_event e
    where e.family_id = f.family_id
      and e.created_at <= $2::timestamptz
  ), '[]'::jsonb),
  'lineage_edges', coalesce((
    select jsonb_agg(to_jsonb(le) order by le.lineage_edge_id)
    from public.bill_lineage_edge le
    where le.family_id = f.family_id
      and le.created_at <= $2::timestamptz
  ), '[]'::jsonb),
  'relationships', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.relationship_id)
    from public.civic_genome_relationship r
    where r.family_id = f.family_id
      and r.created_at <= $2::timestamptz
      and r.updated_at <= $2::timestamptz
  ), '[]'::jsonb),
  'momentum_components', coalesce((
    select jsonb_agg(to_jsonb(mc) order by mc.observed_at, mc.momentum_component_id)
    from public.civic_genome_momentum_component mc
    where mc.family_id = f.family_id
      and mc.created_at <= $2::timestamptz
      and mc.observed_at <= $2::timestamptz
  ), '[]'::jsonb),
  'momentum_snapshots', coalesce((
    select jsonb_agg(to_jsonb(ms) order by ms.snapshot_date, ms.momentum_snapshot_id)
    from public.family_momentum_snapshot ms
    where ms.family_id = f.family_id
      and ms.created_at <= $2::timestamptz
      and ms.snapshot_date <= ($2::timestamptz)::date
  ), '[]'::jsonb),
  'unresolved_family_candidates', coalesce((
    select jsonb_agg(to_jsonb(u) order by u.observed_at, u.unresolved_candidate_id)
    from public.civic_genome_unresolved_family_candidate u
    join public.civic_genome_bill ub on ub.genome_bill_id = u.genome_bill_id
    where ub.family_id = f.family_id
      and u.created_at <= $2::timestamptz
      and u.updated_at <= $2::timestamptz
      and u.observed_at <= $2::timestamptz
  ), '[]'::jsonb)
) as dataset
from public.civic_genome_family f
where f.family_id = $1::uuid
  and f.created_at <= $2::timestamptz
  and f.updated_at <= $2::timestamptz
`;

/**
 * The bounded external snapshot includes the current family row plus the
 * records selected below.  This cursor is the latest source-write timestamp
 * among exactly that material.  It is deliberately data-derived rather than
 * a wall-clock timestamp: unchanged source state therefore resolves to the
 * same immutable snapshot identity on a later startup. PostgreSQL preserves
 * microseconds while node-postgres materializes timestamps as millisecond
 * Dates, so the database returns a millisecond-safe ceiling rather than a
 * value that could be rounded down before the source-row visibility check.
 */
export const CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL = `
select case
  when current_cursor.as_of = date_trunc('milliseconds', current_cursor.as_of)
    then current_cursor.as_of
  else date_trunc('milliseconds', current_cursor.as_of) + interval '1 millisecond'
end as as_of
from (
select greatest(
  f.created_at,
  f.updated_at,
  (
    select max(greatest(b.created_at, b.updated_at))
    from public.civic_genome_bill b
    where b.family_id = f.family_id
  ),
  (
    select max(greatest(t.created_at, t.updated_at))
    from public.civic_genome_trait t
    join public.civic_genome_bill b on b.genome_bill_id = t.genome_bill_id
    where b.family_id = f.family_id
  ),
  (
    select max(pvb.created_at)
    from public.civic_genome_prism_verification_binding pvb
    join public.civic_genome_trait t on t.trait_id = pvb.trait_id
    join public.civic_genome_bill b on b.genome_bill_id = t.genome_bill_id
    where b.family_id = f.family_id
  ),
  (
    select max(e.created_at)
    from public.civic_genome_event e
    where e.family_id = f.family_id
  ),
  (
    select max(le.created_at)
    from public.bill_lineage_edge le
    where le.family_id = f.family_id
  ),
  (
    select max(greatest(r.created_at, r.updated_at))
    from public.civic_genome_relationship r
    where r.family_id = f.family_id
  ),
  (
    select max(greatest(mc.created_at, mc.observed_at))
    from public.civic_genome_momentum_component mc
    where mc.family_id = f.family_id
  ),
  (
    select max(greatest(
      ms.created_at,
      ms.snapshot_date::timestamp at time zone 'UTC'
    ))
    from public.family_momentum_snapshot ms
    where ms.family_id = f.family_id
  ),
  (
    select max(greatest(u.created_at, u.updated_at, u.observed_at))
    from public.civic_genome_unresolved_family_candidate u
    join public.civic_genome_bill b on b.genome_bill_id = u.genome_bill_id
    where b.family_id = f.family_id
  )
) as as_of
from public.civic_genome_family f
where f.family_id = $1::uuid
) current_cursor
`;

type record_value = Record<string, unknown>;

export type civic_genome_external_family_dataset_v1 = {
  family: record_value;
  bills: record_value[];
  traits: Array<{ trait: record_value; prism_bindings: record_value[] }>;
  events: record_value[];
  lineage_edges: record_value[];
  relationships: record_value[];
  momentum_components: record_value[];
  momentum_snapshots: record_value[];
  unresolved_family_candidates: record_value[];
};

export type civic_genome_external_snapshot_build_options_v1 = {
  family_id: string;
  as_of: string;
  generated_at?: string;
  source_commit_sha?: string | null;
  prior_snapshot_hash?: string | null;
};

/**
 * The startup handoff may retain a configured historical lower bound, while
 * still requiring a snapshot that can represent the current canonical family
 * state.  The producer raises that floor to the current source cursor inside
 * its single repeatable-read transaction when necessary.
 */
export type civic_genome_external_current_snapshot_build_options_v1 = Omit<
  civic_genome_external_snapshot_build_options_v1,
  "as_of"
> & {
  as_of_floor: string;
};

type query_result<T> = { rows: T[] };
type query_client = {
  query<T = record_value>(text: string, values?: unknown[]): Promise<query_result<T>>;
  release(): void;
};
type query_pool = { connect(): Promise<query_client> };

function fail(message: string): never {
  throw new Error(`civic_genome_external_snapshot_producer: ${message}`);
}

function record(value: unknown, label: string): record_value {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as record_value;
}

function rows(value: unknown, label: string): record_value[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value.map((entry, index) => record(entry, `${label}[${index}]`));
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function iso(value: string, label: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail(`${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function iso_value(value: unknown, label: string): string {
  if (value instanceof Date) return iso(value.toISOString(), label);
  const candidate = text(value);
  if (!candidate) fail(`${label} must be an ISO timestamp`);
  return iso(candidate, label);
}

function later_iso(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function hex64(value: unknown): string | null {
  const candidate = text(value);
  return candidate && HEX64.test(candidate) ? candidate : null;
}

function object_or_empty(value: unknown): record_value {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as record_value
    : {};
}

function array_or_empty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function component(
  input: Omit<civic_genome_external_snapshot_component_v1, "component_hash">,
): civic_genome_external_snapshot_component_v1 {
  const basis = {
    ...input,
    source_bindings: sort_bindings(input.source_bindings),
    source_verification: sort_verification(input.source_verification),
    unresolved_conditions: [...input.unresolved_conditions].sort(),
  };
  return {
    ...basis,
    component_hash: computeCanonicalHash(basis),
  };
}

function source_binding(
  owner_service: civic_genome_external_source_binding_v1["owner_service"],
  record_type: string,
  record_id: string,
  content_hash: string | null,
  extras: Partial<Omit<civic_genome_external_source_binding_v1,
    "owner_service" | "record_type" | "record_id" | "content_hash">> = {},
): civic_genome_external_source_binding_v1 {
  return {
    owner_service,
    record_type,
    record_id,
    receipt_id: extras.receipt_id ?? null,
    content_hash,
    engine_id: extras.engine_id ?? null,
    engine_version: extras.engine_version ?? null,
    rule_id: extras.rule_id ?? null,
    rule_version: extras.rule_version ?? null,
  };
}

function verification(
  owner_service: civic_genome_external_verification_state_v1["owner_service"],
  state: string,
  evidence_hash: string | null,
  receipt_id: string | null = null,
): civic_genome_external_verification_state_v1 {
  return {
    owner_service,
    state,
    receipt_id,
    evidence_hash,
    mapping_state: "source_native_preserved",
  };
}

function parse_dataset(value: unknown): civic_genome_external_family_dataset_v1 {
  const dataset = record(value, "dataset");
  const trait_entries = rows(dataset.traits, "dataset.traits").map((entry, index) => ({
    trait: record(entry.trait, `dataset.traits[${index}].trait`),
    prism_bindings: rows(entry.prism_bindings, `dataset.traits[${index}].prism_bindings`),
  }));
  return {
    family: record(dataset.family, "dataset.family"),
    bills: rows(dataset.bills, "dataset.bills"),
    traits: trait_entries,
    events: rows(dataset.events, "dataset.events"),
    lineage_edges: rows(dataset.lineage_edges, "dataset.lineage_edges"),
    relationships: rows(dataset.relationships, "dataset.relationships"),
    momentum_components: rows(dataset.momentum_components, "dataset.momentum_components"),
    momentum_snapshots: rows(dataset.momentum_snapshots, "dataset.momentum_snapshots"),
    unresolved_family_candidates: rows(
      dataset.unresolved_family_candidates,
      "dataset.unresolved_family_candidates",
    ),
  };
}

function family_component(family: record_value): civic_genome_external_snapshot_component_v1 {
  const value = semantic_record(family);
  const record_hash = computeCanonicalHash(value);
  const family_id = text(family.family_id) ?? fail("family.family_id is missing");
  const assignment_method = text(object_or_empty(family.signature_json).assignment_method);
  return component({
    component_id: `civic_genome:family:${family_id}`,
    component_type: "family",
    canonical_record_id: family_id,
    inclusion_state: "current",
    jurisdiction_code: null,
    temporal_scope: text(family.last_seen_at),
    value,
    source_bindings: [source_binding(
      "civic_genome",
      "civic_genome_family",
      family_id,
      record_hash,
      {
        engine_id: "civic_genome_family_resolver",
        engine_version: "weighted-confirmed-traits-v2",
        rule_id: assignment_method,
        rule_version: assignment_method ? "1" : null,
      },
    )],
    source_verification: [verification(
      "civic_genome",
      text(family.family_status) ?? "unresolved",
      record_hash,
    )],
    unresolved_conditions: [],
  });
}

function bill_component(bill: record_value): civic_genome_external_snapshot_component_v1 {
  const value = semantic_record(bill);
  const record_hash = computeCanonicalHash(value);
  const genome_bill_id = text(bill.genome_bill_id) ?? fail("bill.genome_bill_id is missing");
  const structural = object_or_empty(bill.structural_dna_json);
  const source_bill_id = text(structural.source_bill_id) ?? text(bill.bill_id) ?? genome_bill_id;
  const docket_hash = hex64(structural.docket_observation_hash) ?? record_hash;
  const rosetta_assembly = object_or_empty(structural.rosetta_assembly);
  const rosetta_receipt = object_or_empty(structural.rosetta_source_receipt);
  const extraction_run_id = text(rosetta_assembly.extraction_run_id)
    ?? text(bill.rosetta_extraction_run_id);
  const source_document_id = text(rosetta_assembly.source_document_id);
  const rosetta_hash = hex64(rosetta_receipt.output_content_hash)
    ?? hex64(rosetta_assembly.rosetta_output_content_hash)
    ?? hex64(bill.structural_dna_hash);

  const bindings: civic_genome_external_source_binding_v1[] = [
    source_binding("docket", "docket_bill", source_bill_id, docket_hash, {
      receipt_id: hex64(structural.docket_observation_hash),
      engine_id: text(structural.source_layer),
      engine_version: null,
      rule_id: text(structural.source_provider),
      rule_version: null,
    }),
    source_binding("civic_genome", "civic_genome_bill", genome_bill_id, record_hash, {
      receipt_id: hex64(bill.structural_dna_hash),
      engine_id: "civic_genome_projection",
      engine_version: "1.0.0",
      rule_id: "docket_to_genome_materialization",
      rule_version: "1.0.0",
    }),
  ];
  const states: civic_genome_external_verification_state_v1[] = [
    verification("docket", text(bill.bill_status) ?? "unresolved", docket_hash),
    verification("civic_genome", text(bill.current_state_position) ?? "unresolved", record_hash),
  ];

  if (extraction_run_id) {
    const receipt_id = source_document_id
      ? `${source_document_id}:${extraction_run_id}`
      : extraction_run_id;
    bindings.push(source_binding("rosetta", "rosetta_extraction_run", extraction_run_id, rosetta_hash, {
      receipt_id,
      engine_id: "rosetta",
      engine_version: text(rosetta_receipt.engine_version)
        ?? text(rosetta_assembly.rosetta_engine_version),
      rule_id: "five_layer_legal_decomposition",
      rule_version: text(rosetta_receipt.rule_set_version)
        ?? text(rosetta_assembly.rosetta_rule_set_version),
    }));
    states.push(verification(
      "rosetta",
      text(rosetta_assembly.verification_state) ?? "unresolved",
      rosetta_hash,
      receipt_id,
    ));
  }

  return component({
    component_id: `civic_genome:bill:${genome_bill_id}`,
    component_type: "bill",
    canonical_record_id: genome_bill_id,
    inclusion_state: "current",
    jurisdiction_code: text(bill.state_code),
    temporal_scope: text(bill.last_action_at) ?? text(bill.introduced_at),
    value,
    source_bindings: bindings,
    source_verification: states,
    unresolved_conditions: [],
  });
}

function trait_component(entry: { trait: record_value; prism_bindings: record_value[] }) {
  const trait = entry.trait;
  const value = semantic_record(trait);
  const record_hash = computeCanonicalHash(value);
  const trait_id = text(trait.trait_id) ?? fail("trait.trait_id is missing");
  const rosetta_hash = hex64(trait.content_hash) ?? record_hash;
  const extraction_run_id = text(trait.extraction_run_id) ?? "unresolved";
  const source_object_id = text(trait.source_object_id) ?? trait_id;

  const bindings: civic_genome_external_source_binding_v1[] = [
    source_binding("rosetta", "rosetta_law_view_object", source_object_id, rosetta_hash, {
      receipt_id: extraction_run_id,
      engine_id: "rosetta",
      engine_version: text(trait.engine_version),
      rule_id: text(trait.source_object_type) ?? "five_layer_object",
      rule_version: text(trait.rule_version),
    }),
    source_binding("civic_genome", "civic_genome_trait", trait_id, record_hash, {
      receipt_id: hex64(trait.trait_fingerprint),
      engine_id: "rosetta_genome_trait_adapter",
      engine_version: text(trait.methodology_version),
      rule_id: text(trait.trait_key),
      rule_version: text(trait.methodology_version),
    }),
  ];
  const states: civic_genome_external_verification_state_v1[] = [
    verification(
      "rosetta",
      text(trait.verification_state) ?? text(trait.signal_status) ?? "unresolved",
      rosetta_hash,
      extraction_run_id,
    ),
    verification(
      "civic_genome",
      text(trait.signal_status) ?? "unresolved",
      record_hash,
      hex64(trait.trait_fingerprint),
    ),
  ];

  for (const prism of entry.prism_bindings) {
    const prism_record_hash = computeCanonicalHash(semantic_record(prism));
    const receipt_id = text(prism.prism_verification_receipt_id)
      ?? text(prism.binding_id)
      ?? fail("Prism binding identity is missing");
    const output_hash = hex64(prism.output_hash) ?? prism_record_hash;
    bindings.push(source_binding("prism", "verification_receipt", receipt_id, output_hash, {
      receipt_id,
      engine_id: "prism",
      engine_version: text(prism.prism_engine_version),
      rule_id: text(prism.prism_rule_set_id),
      rule_version: text(prism.prism_rule_set_version),
    }));
    states.push(verification(
      "prism",
      text(prism.verification_status) ?? "unresolved",
      output_hash,
      receipt_id,
    ));
  }

  return component({
    component_id: `civic_genome:trait:${trait_id}`,
    component_type: "trait",
    canonical_record_id: trait_id,
    inclusion_state: text(trait.signal_status) === "rejected" ? "rejected" : "current",
    jurisdiction_code: null,
    temporal_scope: null,
    value,
    source_bindings: bindings,
    source_verification: states,
    unresolved_conditions: text(trait.signal_status) === "human_review_required"
      ? ["trait_requires_human_review"]
      : [],
  });
}

function generic_component(
  row: record_value,
  config: {
    component_type: civic_genome_external_snapshot_component_v1["component_type"];
    id_field: string;
    record_type: string;
    inclusion_state: civic_genome_external_snapshot_component_v1["inclusion_state"];
    jurisdiction_field?: string;
    temporal_field?: string;
    verification_state: string;
    unresolved_conditions?: string[];
  },
) {
  const value = semantic_record(row);
  const record_hash = computeCanonicalHash(value);
  const record_id = text(row[config.id_field]) ?? fail(`${config.record_type} identity is missing`);
  return component({
    component_id: `civic_genome:${config.component_type}:${record_id}`,
    component_type: config.component_type,
    canonical_record_id: record_id,
    inclusion_state: config.inclusion_state,
    jurisdiction_code: config.jurisdiction_field ? text(row[config.jurisdiction_field]) : null,
    temporal_scope: config.temporal_field ? text(row[config.temporal_field]) : null,
    value,
    source_bindings: [source_binding(
      "civic_genome",
      config.record_type,
      record_id,
      record_hash,
      {
        receipt_id: record_id,
        engine_id: "civic_genome",
        engine_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_METHODOLOGY_VERSION,
        rule_id: config.component_type,
        rule_version: "1.0.0",
      },
    )],
    source_verification: [verification(
      "civic_genome",
      config.verification_state,
      record_hash,
      record_id,
    )],
    unresolved_conditions: config.unresolved_conditions ?? [],
  });
}

export function build_civic_genome_family_snapshot_v1(
  input_dataset: civic_genome_external_family_dataset_v1,
  options: civic_genome_external_snapshot_build_options_v1,
): civic_genome_external_snapshot_v1 {
  const as_of = iso(options.as_of, "as_of");
  const generated_at = iso(options.generated_at ?? new Date().toISOString(), "generated_at");
  const family_id = text(input_dataset.family.family_id) ?? fail("family.family_id is missing");
  if (family_id !== options.family_id) fail("dataset family does not match requested family_id");

  const components: civic_genome_external_snapshot_component_v1[] = [
    family_component(input_dataset.family),
    ...input_dataset.bills.map(bill_component),
    ...input_dataset.traits.map(trait_component),
    ...input_dataset.events.map(row => generic_component(row, {
      component_type: "event",
      id_field: "event_id",
      record_type: "civic_genome_event",
      inclusion_state: "historical",
      jurisdiction_field: "state_code",
      temporal_field: "event_timestamp",
      verification_state: text(row.event_type) ?? "recorded",
    })),
    ...input_dataset.lineage_edges.map(row => generic_component(row, {
      component_type: "lineage_edge",
      id_field: "lineage_edge_id",
      record_type: "bill_lineage_edge",
      inclusion_state: "current",
      verification_state: "observed",
    })),
    ...input_dataset.relationships.map(row => generic_component(row, {
      component_type: "relationship",
      id_field: "relationship_id",
      record_type: "civic_genome_relationship",
      inclusion_state: text(row.validation_state) === "rejected" ? "rejected" : "current",
      verification_state: text(row.validation_state) ?? "observed",
    })),
    ...input_dataset.momentum_components.map(row => generic_component(row, {
      component_type: "momentum_component",
      id_field: "momentum_component_id",
      record_type: "civic_genome_momentum_component",
      inclusion_state: "current",
      temporal_field: "observed_at",
      verification_state: "derived_component",
    })),
    ...input_dataset.momentum_snapshots.map(row => generic_component(row, {
      component_type: "momentum_snapshot",
      id_field: "momentum_snapshot_id",
      record_type: "family_momentum_snapshot",
      inclusion_state: "historical",
      temporal_field: "snapshot_date",
      verification_state: "derived_snapshot",
    })),
    ...input_dataset.unresolved_family_candidates.map(row => {
      const reason = text(row.resolution_reason) ?? "unresolved";
      return generic_component(row, {
        component_type: "unresolved_family_candidate",
        id_field: "unresolved_candidate_id",
        record_type: "civic_genome_unresolved_family_candidate",
        inclusion_state: "unresolved",
        temporal_field: "observed_at",
        verification_state: "unresolved",
        unresolved_conditions: [`family_resolution:${reason}`],
      });
    }),
  ].sort((left, right) => left.component_id.localeCompare(right.component_id));

  const jurisdiction_codes = [...new Set(
    input_dataset.bills.map(row => text(row.state_code)).filter((value): value is string => Boolean(value)),
  )].sort();
  const unresolved_conditions = input_dataset.unresolved_family_candidates
    .map(row => {
      const candidate_id = text(row.unresolved_candidate_id) ?? "unknown";
      const reason = text(row.resolution_reason) ?? "unresolved";
      return `unresolved_family_candidate:${candidate_id}:${reason}`;
    })
    .sort();
  const excluded_component_types = ["comparison_matrix", "comparison_state_cell"] as const;
  const identity_hash = computeCanonicalHash({
    contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    family_id,
    as_of,
    methodology_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_METHODOLOGY_VERSION,
  });
  const snapshot_id = `cg-family-snapshot-${identity_hash.slice(0, 32)}`;

  const placeholder_hash = "0".repeat(64);
  const provisional: civic_genome_external_snapshot_v1 = {
    contract_id: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_ID,
    contract_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_CONTRACT_VERSION,
    canonical_owner: "lighthouse/civic_genome",
    snapshot_id,
    snapshot_kind: "baseline_export",
    immutable: true,
    scope: {
      scope_type: "family",
      scope_ids: [family_id],
      jurisdiction_codes,
    },
    as_of,
    methodology_version: CIVIC_GENOME_EXTERNAL_SNAPSHOT_METHODOLOGY_VERSION,
    components,
    component_count: components.length,
    unresolved_conditions,
    excluded_component_types: [...excluded_component_types],
    completeness_state: "bounded_complete",
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
      replay_state: options.prior_snapshot_hash === snapshot_hash
        ? "identical_replay"
        : "original",
      source_commit_sha: options.source_commit_sha ?? null,
      generated_at,
    },
  });
}

async function produce_civic_genome_family_snapshot_from_transaction_v1(
  client: query_client,
  options: Omit<civic_genome_external_snapshot_build_options_v1, "as_of">,
  as_of: string,
): Promise<civic_genome_external_snapshot_v1> {
  const result = await client.query<{ dataset: unknown }>(
    CIVIC_GENOME_EXTERNAL_FAMILY_DATASET_SQL,
    [options.family_id, as_of],
  );
  const dataset_row = result.rows[0];
  if (!dataset_row) {
    fail("family was not found or as_of precedes the current canonical record state");
  }
  const dataset = parse_dataset(dataset_row.dataset);
  return build_civic_genome_family_snapshot_v1(dataset, {
    ...options,
    as_of,
  });
}

async function within_civic_genome_external_snapshot_transaction<T>(
  dependencies: { pool?: query_pool },
  operation: (client: query_client) => Promise<T>,
): Promise<T> {
  const pool = dependencies.pool ?? getPool();
  const client = await pool.connect();
  let transaction_started = false;
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    transaction_started = true;
    const result = await operation(client);
    await client.query("commit");
    transaction_started = false;
    return result;
  } catch (error) {
    if (transaction_started) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original failure while still attempting transaction cleanup.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function produce_civic_genome_family_snapshot_v1(
  options: civic_genome_external_snapshot_build_options_v1,
  dependencies: { pool?: query_pool } = {},
): Promise<civic_genome_external_snapshot_v1> {
  const as_of = iso(options.as_of, "as_of");
  const { as_of: _as_of, ...build_options } = options;
  return within_civic_genome_external_snapshot_transaction(dependencies, client =>
    produce_civic_genome_family_snapshot_from_transaction_v1(client, build_options, as_of),
  );
}

/**
 * Produces an immutable snapshot at the current canonical source cursor.  A
 * configured floor is retained when it is newer, but a stale configured time
 * never causes a current family row to be misclassified as absent.
 */
export async function produce_current_civic_genome_family_snapshot_v1(
  options: civic_genome_external_current_snapshot_build_options_v1,
  dependencies: { pool?: query_pool } = {},
): Promise<civic_genome_external_snapshot_v1> {
  const as_of_floor = iso(options.as_of_floor, "as_of_floor");
  const { as_of_floor: _as_of_floor, ...build_options } = options;
  return within_civic_genome_external_snapshot_transaction(dependencies, async client => {
    const cursor_result = await client.query<{ as_of: unknown }>(
      CIVIC_GENOME_EXTERNAL_FAMILY_CURRENT_CURSOR_SQL,
      [options.family_id],
    );
    const cursor_row = cursor_result.rows[0];
    if (!cursor_row) fail("family was not found");
    const current_as_of = iso_value(cursor_row.as_of, "current canonical snapshot cursor");
    const as_of = later_iso(as_of_floor, current_as_of);
    return produce_civic_genome_family_snapshot_from_transaction_v1(client, build_options, as_of);
  });
}

export function summarize_civic_genome_external_snapshot_v1(snapshot: civic_genome_external_snapshot_v1) {
  const component_type_counts = snapshot.components.reduce<Record<string, number>>((counts, row) => {
    counts[row.component_type] = (counts[row.component_type] ?? 0) + 1;
    return counts;
  }, {});
  return {
    snapshot_id: snapshot.snapshot_id,
    snapshot_hash: snapshot.snapshot_hash,
    export_receipt_id: snapshot.export_receipt.export_receipt_id,
    export_receipt_hash: snapshot.export_receipt.export_receipt_hash,
    deterministic_replay_key: snapshot.export_receipt.deterministic_replay_key,
    replay_state: snapshot.export_receipt.replay_state,
    component_count: snapshot.component_count,
    component_type_counts,
    unresolved_condition_count: snapshot.unresolved_conditions.length,
    completeness_state: snapshot.completeness_state,
  };
}
