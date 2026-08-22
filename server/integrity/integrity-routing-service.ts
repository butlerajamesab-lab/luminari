import { query_with_diagnostics } from "../db";
import {
  INTEGRITY_ROUTE_CATALOG_VERSION,
  resolve_integrity_route,
  type integrity_candidate_type,
} from "./integrity-routing-catalog";

type integrity_query_result<row_type> = {
  rows: row_type[];
  rowCount: number | null;
};

export type integrity_query = <row_type = Record<string, unknown>>(
  text: string,
  values?: unknown[],
  options?: { label?: string; pool_acquire_timeout_ms?: number; query_timeout_ms?: number },
) => Promise<integrity_query_result<row_type>>;

export type integrity_candidate_review = {
  candidate_id: string;
  case_id: string | null;
  signal_id: string;
  candidate_type: integrity_candidate_type;
  jurisdiction_id: string | null;
  summary: string;
  status: candidate_status;
  candidate_hash: string;
  observed_at: string | Date | null;
  created_at: string | Date;
  evidence_count: number;
  support_count: number;
  contradiction_count: number;
  latest_assessment_state: corroboration_state | null;
  atlas_is_current: boolean;
  atlas_governance_status: string;
  atlas_verification_state: string;
  atlas_candidate_id: string | null;
  atlas_candidate_hash: string | null;
  atlas_semantic_key: string | null;
  atlas_confidence_score: number;
  atlas_severity: string;
};

export type corroboration_state =
  | "uncorroborated"
  | "single_source"
  | "independently_supported"
  | "contradicted"
  | "disputed"
  | "inconclusive"
  | "verified_for_routing";

export type candidate_status =
  | "candidate"
  | "evidence_gathering"
  | "corroboration_review"
  | "review_hold"
  | "corroborated"
  | "contradicted"
  | "inconclusive"
  | "dismissed"
  | "routing_review"
  | "escalation_ready"
  | "escalated"
  | "closed";

export type integrity_projection_readiness = {
  atlas_current_integrity_candidate_count: number;
  projected_review_count: number;
  unprojected_review_count: number;
  projection_healthy: boolean;
  source_system: "Atlas Domain 3";
  interpretation_boundary: string;
};

type candidate_row = Omit<
  integrity_candidate_review,
  "evidence_count" | "support_count" | "contradiction_count" | "atlas_confidence_score"
> & {
  evidence_count: string | number;
  support_count: string | number;
  contradiction_count: string | number;
  atlas_confidence_score: string | number;
};

type evidence_metrics = {
  selected_count: string | number;
  independent_source_count: string | number;
  contradiction_count: string | number;
  source_class_count: string | number;
  rule_id: string;
  rule_version: string;
  atlas_is_current: boolean;
};

function numeric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function normalize_candidate(row: candidate_row): integrity_candidate_review {
  return {
    ...row,
    evidence_count: numeric(row.evidence_count),
    support_count: numeric(row.support_count),
    contradiction_count: numeric(row.contradiction_count),
    atlas_confidence_score: numeric(row.atlas_confidence_score),
  };
}

export async function sync_atlas_integrity_candidates(
  limit = 1000,
  query: integrity_query = query_with_diagnostics,
): Promise<{ projected_count: number; candidate_ids: string[]; limit: number }> {
  const result = await query<{ receipt: unknown }>(
    "select public.project_atlas_integrity_candidates_v1($1::integer) as receipt",
    [limit],
    {
      label: "integrity_atlas_projection_reconciliation",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 15_000,
    },
  );
  const receipt = result.rows[0]?.receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("integrity_projection_receipt_incomplete");
  }
  const value = receipt as Record<string, unknown>;
  return {
    projected_count: numeric(value.projected_count),
    candidate_ids: Array.isArray(value.candidate_ids) ? value.candidate_ids.map(String) : [],
    limit: numeric(value.limit ?? limit),
  };
}

export async function list_integrity_candidates(
  candidate_id?: string,
  query: integrity_query = query_with_diagnostics,
): Promise<integrity_candidate_review[]> {
  const result = await query<candidate_row>(
    `select *
     from public.integrity_candidate_review_v2($1::uuid)
     order by atlas_is_current desc, created_at desc, candidate_id`,
    [candidate_id ?? null],
    {
      label: "integrity_candidate_review",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  return result.rows.map(normalize_candidate);
}

export async function get_integrity_candidate_detail(
  candidate_id: string,
  query: integrity_query = query_with_diagnostics,
): Promise<Record<string, unknown>> {
  const result = await query<{ detail: Record<string, unknown> | null }>(
    "select public.integrity_candidate_detail_v1($1::uuid) as detail",
    [candidate_id],
    {
      label: "integrity_candidate_detail",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  if (!result.rows[0]?.detail) throw new Error("integrity_candidate_not_found");
  return result.rows[0].detail;
}

export async function get_integrity_projection_readiness(
  query: integrity_query = query_with_diagnostics,
): Promise<integrity_projection_readiness> {
  const result = await query<{ readiness: Record<string, unknown> | null }>(
    "select public.integrity_projection_readiness_v1() as readiness",
    [],
    {
      label: "integrity_projection_readiness",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const readiness = result.rows[0]?.readiness;
  if (!readiness) throw new Error("integrity_projection_readiness_unavailable");
  return {
    atlas_current_integrity_candidate_count: numeric(String(readiness.atlas_current_integrity_candidate_count ?? 0)),
    projected_review_count: numeric(String(readiness.projected_review_count ?? 0)),
    unprojected_review_count: numeric(String(readiness.unprojected_review_count ?? 0)),
    projection_healthy: readiness.projection_healthy === true,
    source_system: "Atlas Domain 3",
    interpretation_boundary: String(readiness.interpretation_boundary ?? ""),
  };
}

export async function attach_integrity_review_evidence(input: {
  candidate_id: string;
  source_class: string;
  source_relation: string;
  source_record_key: string;
  source_uri?: string;
  quote_text?: string;
  pinpoint?: string;
  source_content_hash: string;
  supports_or_contradicts: "supports" | "contradicts" | "context_only" | "unresolved";
  observed_at?: string;
  created_by_id: string;
  query?: integrity_query;
}): Promise<string> {
  const query = input.query ?? query_with_diagnostics;
  const result = await query<{ evidence_link_id: string }>(
    "select public.attach_integrity_candidate_evidence_v1($1::jsonb)::text as evidence_link_id",
    [JSON.stringify({
      candidate_id: input.candidate_id,
      source_class: input.source_class,
      source_relation: input.source_relation,
      source_record_key: input.source_record_key,
      source_uri: input.source_uri ?? null,
      quote_text: input.quote_text ?? null,
      pinpoint: input.pinpoint ?? null,
      source_content_hash: input.source_content_hash.toLowerCase(),
      supports_or_contradicts: input.supports_or_contradicts,
      observed_at: input.observed_at ?? null,
      provenance_type: "reviewer",
      created_by_id: input.created_by_id,
    })],
    {
      label: "integrity_reviewer_evidence_registration",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const evidence_link_id = result.rows[0]?.evidence_link_id;
  if (!evidence_link_id) throw new Error("integrity_evidence_receipt_incomplete");
  return evidence_link_id;
}

async function load_evidence_metrics(
  candidate_id: string,
  evidence_link_ids: string[],
  query: integrity_query,
): Promise<evidence_metrics> {
  const result = await query<evidence_metrics>(
    `select
       count(e.evidence_link_id) as selected_count,
       count(distinct e.source_relation) as independent_source_count,
       count(*) filter (where e.supports_or_contradicts = 'contradicts') as contradiction_count,
       count(distinct e.source_class) as source_class_count,
       c.rule_id,
       c.rule_version,
       s.is_current as atlas_is_current
     from private.integrity_pattern_candidate c
     join public.live_data_signals s on s.live_data_signal_id = c.signal_id
     left join private.integrity_evidence_link e
       on e.candidate_id = c.candidate_id
      and e.evidence_link_id = any($2::uuid[])
     where c.candidate_id = $1::uuid
     group by c.candidate_id, s.live_data_signal_id`,
    [candidate_id, evidence_link_ids],
    {
      label: "integrity_evidence_metrics",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const metrics = result.rows[0];
  if (!metrics) throw new Error("integrity_candidate_not_found");
  if (numeric(metrics.selected_count) !== evidence_link_ids.length) {
    throw new Error("corroboration_evidence_must_belong_to_candidate");
  }
  return metrics;
}

function validate_corroboration(input: {
  assessment_state: corroboration_state;
  independent_source_count: number;
  contradiction_count: number;
  source_class_count: number;
}): void {
  if (input.assessment_state === "single_source" && input.independent_source_count !== 1) {
    throw new Error("single_source_count_must_equal_one");
  }
  if (
    ["independently_supported", "verified_for_routing"].includes(input.assessment_state) &&
    (input.independent_source_count < 2 || input.source_class_count < 2)
  ) {
    throw new Error("independent_corroboration_requires_two_sources_and_classes");
  }
  if (input.assessment_state === "verified_for_routing" && input.contradiction_count > 0) {
    throw new Error("routing_verification_cannot_ignore_contradictions");
  }
  if (input.assessment_state === "contradicted" && input.contradiction_count < 1) {
    throw new Error("contradicted_assessment_requires_contradiction");
  }
}

export async function record_integrity_corroboration(input: {
  candidate_id: string;
  assessment_state: corroboration_state;
  rationale: string;
  evidence_link_ids: string[];
  assessed_by_id: string;
  query?: integrity_query;
}): Promise<string> {
  const query = input.query ?? query_with_diagnostics;
  const evidence_link_ids = [...new Set(input.evidence_link_ids)].sort();
  if (evidence_link_ids.length === 0) throw new Error("corroboration_evidence_required");

  const metrics = await load_evidence_metrics(input.candidate_id, evidence_link_ids, query);
  const independent_source_count = numeric(metrics.independent_source_count);
  const contradiction_count = numeric(metrics.contradiction_count);
  const source_class_count = numeric(metrics.source_class_count);
  validate_corroboration({
    assessment_state: input.assessment_state,
    independent_source_count,
    contradiction_count,
    source_class_count,
  });
  if (input.assessment_state === "verified_for_routing" && !metrics.atlas_is_current) {
    throw new Error("stale_atlas_candidate_cannot_be_verified_for_routing");
  }

  const result = await query<{ assessment_id: string }>(
    "select public.record_integrity_corroboration_v1($1::jsonb)::text as assessment_id",
    [JSON.stringify({
      candidate_id: input.candidate_id,
      assessment_state: input.assessment_state,
      independent_source_count,
      contradiction_count,
      source_class_count,
      rationale: input.rationale,
      evidence_link_ids,
      rule_id: "lighthouse.integrity.corroboration_gate",
      rule_version: "1.0.0",
      assessed_by_type: "administrator",
      assessed_by_id: input.assessed_by_id,
      candidate_rule_id: metrics.rule_id,
      candidate_rule_version: metrics.rule_version,
    })],
    {
      label: "integrity_corroboration_registration",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const assessment_id = result.rows[0]?.assessment_id;
  if (!assessment_id) throw new Error("integrity_corroboration_receipt_incomplete");
  return assessment_id;
}

async function assert_verified_assessment(
  candidate_id: string,
  assessment_id: string,
  query: integrity_query,
): Promise<void> {
  const result = await query<{ verified: boolean }>(
    `select exists (
       select 1
       from private.integrity_corroboration_assessment a
       join public.live_data_signals s on s.live_data_signal_id = (
         select c.signal_id
         from private.integrity_pattern_candidate c
         where c.candidate_id = a.candidate_id
       )
       where a.assessment_id = $2::uuid
         and a.candidate_id = $1::uuid
         and a.assessment_state = 'verified_for_routing'
         and a.assessment_order = (
           select max(latest.assessment_order)
           from private.integrity_corroboration_assessment latest
           where latest.candidate_id = a.candidate_id
         )
         and s.is_current
     ) as verified`,
    [candidate_id, assessment_id],
    {
      label: "integrity_verified_assessment_gate",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  if (!result.rows[0]?.verified) throw new Error("verified_current_assessment_required");
}

export async function transition_integrity_candidate(input: {
  candidate_id: string;
  to_status: candidate_status;
  reason: string;
  actor_type: "reviewer" | "administrator";
  actor_id: string;
  assessment_id?: string;
  query?: integrity_query;
}): Promise<string> {
  if (input.to_status === "escalated") {
    throw new Error("integrity_transmission_not_supported");
  }
  const query = input.query ?? query_with_diagnostics;
  if (input.to_status === "escalation_ready") {
    if (!input.assessment_id) throw new Error("verified_current_assessment_required");
    await assert_verified_assessment(input.candidate_id, input.assessment_id, query);
  }
  const result = await query<{ transition_id: string }>(
    "select public.transition_integrity_candidate_v1($1::jsonb)::text as transition_id",
    [JSON.stringify({
      candidate_id: input.candidate_id,
      to_status: input.to_status,
      reason: input.reason,
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      assessment_id: input.assessment_id ?? null,
    })],
    {
      label: "integrity_candidate_transition",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const transition_id = result.rows[0]?.transition_id;
  if (!transition_id) throw new Error("integrity_transition_receipt_incomplete");
  return transition_id;
}

export async function create_integrity_escalation_draft(input: {
  candidate_id: string;
  assessment_id: string;
  evidence_link_ids: string[];
  route_id?: string;
  reviewer_notes: string;
  created_by_id: string;
  query?: integrity_query;
}): Promise<{ packet_id: string; route_id: string; transmission_authorized: false }> {
  const query = input.query ?? query_with_diagnostics;
  await assert_verified_assessment(input.candidate_id, input.assessment_id, query);
  const candidates = await list_integrity_candidates(input.candidate_id, query);
  const candidate = candidates[0];
  if (!candidate) throw new Error("integrity_candidate_not_found");
  if (!candidate.atlas_is_current) throw new Error("stale_atlas_candidate_cannot_be_routed");
  if (!candidate.jurisdiction_id) throw new Error("integrity_candidate_jurisdiction_required");
  const route = resolve_integrity_route({
    jurisdiction_id: candidate.jurisdiction_id,
    candidate_type: candidate.candidate_type,
    route_id: input.route_id,
  });
  const evidence_link_ids = [...new Set(input.evidence_link_ids)].sort();
  if (evidence_link_ids.length === 0) throw new Error("integrity_packet_evidence_required");
  await load_evidence_metrics(input.candidate_id, evidence_link_ids, query);
  const packet_payload = {
    schema_version: "integrity-escalation-draft-v1",
    source_system: "Atlas Domain 3",
    allegation_status: "unproven_integrity_candidate",
    transmission_authorized: false,
    human_review_required: true,
    candidate: {
      candidate_id: candidate.candidate_id,
      atlas_candidate_id: candidate.atlas_candidate_id,
      candidate_type: candidate.candidate_type,
      jurisdiction_id: candidate.jurisdiction_id,
      summary: candidate.summary,
      candidate_hash: candidate.candidate_hash,
    },
    assessment_id: input.assessment_id,
    evidence_link_ids,
    reviewer_notes: input.reviewer_notes,
    disclaimer: "This packet contains evidence-bound integrity-pattern candidates for authorized review. It does not determine corruption, criminal liability, intent, or wrongdoing.",
  };
  const result = await query<{ packet_id: string }>(
    "select public.create_integrity_escalation_packet_v1($1::jsonb)::text as packet_id",
    [JSON.stringify({
      candidate_id: input.candidate_id,
      assessment_id: input.assessment_id,
      evidence_link_ids,
      routing: {
        jurisdiction_id: candidate.jurisdiction_id,
        agency_name: route.agency_name,
        department_name: route.department_name,
        channel_type: route.channel_type,
        destination_uri: route.destination_uri,
        authority_basis: route.authority_basis,
        routing_constraints: {
          ...route.routing_constraints,
          route_id: route.route_id,
          catalog_version: INTEGRITY_ROUTE_CATALOG_VERSION,
        },
        source_as_of: route.source_as_of,
      },
      packet_payload,
      created_by_type: "administrator",
      created_by_id: input.created_by_id,
    })],
    {
      label: "integrity_escalation_draft",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 10_000,
    },
  );
  const packet_id = result.rows[0]?.packet_id;
  if (!packet_id) throw new Error("integrity_packet_receipt_incomplete");
  return { packet_id, route_id: route.route_id, transmission_authorized: false };
}
