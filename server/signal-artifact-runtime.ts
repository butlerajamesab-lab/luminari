import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";

import { getPool, verifyCaseOwnership, verifyCaseWriteAccess } from "./db";

export const SIGNAL_ARTIFACT_DOMAINS = [
  "legal_pattern",
  "live_data",
  "convergence",
] as const;

export type SignalArtifactDomain = typeof SIGNAL_ARTIFACT_DOMAINS[number];

export const SIGNAL_CASE_RELATIONSHIPS = [
  "context",
  "supporting_candidate",
  "contradiction_candidate",
  "pattern_candidate",
  "routing_context",
] as const;

export type SignalCaseRelationship = typeof SIGNAL_CASE_RELATIONSHIPS[number];

type ArtifactRow = {
  domain_code: SignalArtifactDomain;
  record_id: string;
  artifact_type: string;
  title: string;
  description: string;
  jurisdiction_id: string | null;
  status: string;
  severity: string | null;
  confidence_score: number | string | null;
  source_reference: string | null;
  source_hash: string;
  occurred_at: Date | string | null;
  created_at: Date | string | null;
};

type ArtifactDestination = {
  home_label: string;
  home_path: string;
  environmental_effect: string;
};

function wireDate(value: Date | string | null): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function wireJson(value: unknown, fallback: unknown): unknown {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function signal_artifact_destination(
  domain: SignalArtifactDomain,
  artifactType: string,
): ArtifactDestination {
  if (domain === "live_data") {
    return {
      home_label: "Anomaly Viewfinder",
      home_path: "/viewfinder",
      environmental_effect:
        "This Atlas-derived observation candidate identifies a measurable recurrence, concentration, spike, or unresolved-record condition. It is a lead for human review, not a finding of wrongdoing.",
    };
  }

  if (domain === "convergence") {
    return {
      home_label: "Integrity Review",
      home_path: "/integrity-review",
      environmental_effect:
        "This record joins independently produced intake, legal-pattern, and live-data artifacts. It must remain in governed review until its evidence and contradictions are resolved.",
    };
  }

  if (artifactType === "workflow_gap") {
    return {
      home_label: "Structural Diagnostics",
      home_path: "/diagnostics",
      environmental_effect:
        "This verified workflow mismatch marks a weak joint in the legal or administrative process where a required modal, exception, or procedural step differs from the enrolled source.",
    };
  }

  if ([
    "override_conflict",
    "statutory_contradiction",
    "definition_conflict",
    "doctrinal_conflict",
  ].includes(artifactType)) {
    return {
      home_label: "Contradiction Scoring",
      home_path: "/contradiction-scoring",
      environmental_effect:
        "This source-bound legal mismatch may change how a rule, exception, definition, or authority is applied. It requires corroboration before it can affect a case or escalation decision.",
    };
  }

  return {
    home_label: "Anomaly Viewfinder",
    home_path: "/viewfinder",
    environmental_effect:
      "This legal pattern is a provenance-bound analytical artifact. Its practical effect depends on jurisdiction, source authority, and human corroboration.",
  };
}

function toListItem(row: ArtifactRow) {
  const destination = signal_artifact_destination(
    row.domain_code,
    row.artifact_type,
  );
  const query = new URLSearchParams({
    signal_domain: row.domain_code,
    signal_id: row.record_id,
  });
  return {
    domain_code: row.domain_code,
    record_id: String(row.record_id),
    artifact_type: String(row.artifact_type),
    title: String(row.title ?? "Untitled artifact"),
    description: String(row.description ?? ""),
    jurisdiction_id:
      row.jurisdiction_id == null ? null : String(row.jurisdiction_id),
    status: String(row.status ?? "unknown"),
    severity: row.severity == null ? null : String(row.severity),
    confidence_score:
      row.confidence_score == null ? null : Number(row.confidence_score),
    source_reference:
      row.source_reference == null ? null : String(row.source_reference),
    source_hash: String(row.source_hash),
    occurred_at: wireDate(row.occurred_at),
    created_at: wireDate(row.created_at),
    ...destination,
    destination_path: `${destination.home_path}?${query.toString()}`,
  };
}

export async function list_signal_artifacts(input: {
  domain?: SignalArtifactDomain;
  limit: number;
  offset: number;
  query?: string;
}) {
  const pool = getPool();
  const queryText = input.query?.trim() ?? "";
  const domain = input.domain ?? null;
  const { rows } = await pool.query<ArtifactRow & { total_count: number | string }>(
    `
      with artifacts as (
        select 'legal_pattern'::text as domain_code,
               pattern_id::text as record_id,
               pattern_type as artifact_type,
               title,
               description,
               coalesce(jurisdiction_scope ->> 'state_code',
                        jurisdiction_scope ->> 'jurisdiction_id') as jurisdiction_id,
               verification_state as status,
               null::text as severity,
               null::numeric as confidence_score,
               source_relation || ':' || source_record_key as source_reference,
               pattern_hash as source_hash,
               first_observed_at as occurred_at,
               created_at
          from public.legal_patterns
         where is_current
        union all
        select 'live_data'::text,
               live_data_signal_id::text,
               signal_type,
               title,
               description,
               jurisdiction_id,
               verification_state,
               severity,
               confidence_score,
               primary_stream_id || ':' || live_data_signal_id::text,
               signal_hash,
               detected_at as occurred_at,
               created_at
          from public.live_data_signals
         where is_current
        union all
        select 'convergence'::text,
               convergence_id::text,
               convergence_type,
               title,
               description,
               null::text,
               status,
               null::text,
               null::numeric,
               'signal_convergences:' || convergence_id::text,
               convergence_hash,
               created_at,
               created_at
          from public.signal_convergences
         where is_current
      ), filtered as (
        select *
          from artifacts
         where ($1::text is null or domain_code = $1)
           and ($2::text = '' or title ilike '%' || $2 || '%'
             or description ilike '%' || $2 || '%'
             or artifact_type ilike '%' || $2 || '%'
             or coalesce(jurisdiction_id, '') ilike '%' || $2 || '%'
             or coalesce(source_reference, '') ilike '%' || $2 || '%')
      )
      select filtered.*, count(*) over() as total_count
        from filtered
       order by occurred_at desc nulls last, created_at desc, record_id
       limit $3 offset $4
    `,
    [domain, queryText, input.limit, input.offset],
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const items = rows.map((row) => toListItem(row));
  const nextOffset = input.offset + items.length;
  return {
    items,
    total,
    limit: input.limit,
    offset: input.offset,
    has_more: nextOffset < total,
    next_offset: nextOffset < total ? nextOffset : null,
  };
}

function notFound(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Canonical signal artifact not found",
  });
}

export async function read_signal_artifact(
  domain: SignalArtifactDomain,
  recordId: string,
) {
  const pool = getPool();
  if (domain === "legal_pattern") {
    const { rows } = await pool.query(
      `select pattern_id::text as record_id,
              pattern_type as artifact_type,
              title,
              description,
              coalesce(jurisdiction_scope ->> 'state_code',
                       jurisdiction_scope ->> 'jurisdiction_id') as jurisdiction_id,
              verification_state as status,
              null::text as severity,
              null::numeric as confidence_score,
              source_relation || ':' || source_record_key as source_reference,
              pattern_hash as source_hash,
              first_observed_at as occurred_at,
              created_at,
              source_relation,
              source_record_key,
              jurisdiction_scope,
              authority_refs,
              contradiction_refs,
              enforcement_refs,
              engine_id,
              engine_version,
              rule_id,
              rule_version,
              input_hash,
              is_current
         from public.legal_patterns
        where pattern_id = $1::uuid and is_current
        limit 1`,
      [recordId],
    );
    if (!rows[0]) notFound();
    const row = rows[0];
    return {
      ...toListItem({ ...row, domain_code: domain }),
      evidence: {
        authority_refs: wireJson(row.authority_refs, []),
        contradiction_refs: wireJson(row.contradiction_refs, []),
        enforcement_refs: wireJson(row.enforcement_refs, []),
      },
      provenance: {
        source_relation: row.source_relation,
        source_record_key: row.source_record_key,
        jurisdiction_scope: wireJson(row.jurisdiction_scope, {}),
        engine_id: row.engine_id,
        engine_version: row.engine_version,
        rule_id: row.rule_id,
        rule_version: row.rule_version,
        input_hash: row.input_hash,
      },
    };
  }

  if (domain === "live_data") {
    const { rows } = await pool.query(
      `select live_data_signal_id::text as record_id,
              signal_type as artifact_type,
              title,
              description,
              jurisdiction_id,
              verification_state as status,
              severity,
              confidence_score,
              primary_stream_id || ':' || live_data_signal_id::text as source_reference,
              signal_hash as source_hash,
              detected_at as occurred_at,
              created_at,
              primary_stream_id,
              source_event_refs,
              entity_ids,
              entity_resolution_status,
              supporting_statistics,
              evidence_refs,
              detection_rule_id,
              detection_rule_version,
              input_hash,
              engine_id,
              engine_version,
              source_freshness_at,
              detected_at,
              atlas_candidate_id,
              atlas_semantic_key,
              atlas_candidate_hash,
              governance_status,
              is_current
         from public.live_data_signals
        where live_data_signal_id = $1::uuid and is_current
        limit 1`,
      [recordId],
    );
    if (!rows[0]) notFound();
    const row = rows[0];
    return {
      ...toListItem({ ...row, domain_code: domain }),
      entity_resolution_status: row.entity_resolution_status,
      evidence: {
        evidence_refs: wireJson(row.evidence_refs, []),
        source_event_refs: wireJson(row.source_event_refs, []),
        entity_ids: wireJson(row.entity_ids, []),
        supporting_statistics: wireJson(row.supporting_statistics, {}),
      },
      provenance: {
        primary_stream_id: row.primary_stream_id,
        engine_id: row.engine_id,
        engine_version: row.engine_version,
        rule_id: row.detection_rule_id,
        rule_version: row.detection_rule_version,
        input_hash: row.input_hash,
        source_freshness_at: wireDate(row.source_freshness_at),
        detected_at: wireDate(row.detected_at),
        source_atlas_candidate_id: row.atlas_candidate_id,
        source_atlas_candidate_semantic_key: row.atlas_semantic_key,
        source_atlas_candidate_hash: row.atlas_candidate_hash,
        governance_status: row.governance_status,
      },
    };
  }

  const { rows } = await pool.query(
    `select convergence_id::text as record_id,
            convergence_type as artifact_type,
            title,
            description,
            null::text as jurisdiction_id,
            status,
            null::text as severity,
            null::numeric as confidence_score,
            'signal_convergences:' || convergence_id::text as source_reference,
            convergence_hash as source_hash,
            created_at as occurred_at,
            created_at,
            intake_signal_id,
            legal_pattern_id,
            live_data_signal_id,
            intersection_basis,
            evidence_refs,
            rule_id,
            rule_version,
            engine_id,
            engine_version,
            input_hash,
            is_current
       from public.signal_convergences
      where convergence_id = $1::uuid and is_current
      limit 1`,
    [recordId],
  );
  if (!rows[0]) notFound();
  const row = rows[0];
  return {
    ...toListItem({ ...row, domain_code: domain }),
    evidence: {
      evidence_refs: wireJson(row.evidence_refs, []),
      intersection_basis: wireJson(row.intersection_basis, {}),
      domain_records: {
        intake_signal_id: row.intake_signal_id,
        legal_pattern_id: row.legal_pattern_id,
        live_data_signal_id: row.live_data_signal_id,
      },
    },
    provenance: {
      rule_id: row.rule_id,
      rule_version: row.rule_version,
      engine_id: row.engine_id,
      engine_version: row.engine_version,
      input_hash: row.input_hash,
    },
  };
}

function domainColumns(domain: SignalArtifactDomain): {
  intake_signal_id: string | null;
  legal_pattern_id: string | null;
  live_data_signal_id: string | null;
  convergence_id: string | null;
} {
  return {
    intake_signal_id: null,
    legal_pattern_id: domain === "legal_pattern" ? "artifact" : null,
    live_data_signal_id: domain === "live_data" ? "artifact" : null,
    convergence_id: domain === "convergence" ? "artifact" : null,
  };
}

export async function connect_signal_artifact_to_case(input: {
  domain: SignalArtifactDomain;
  record_id: string;
  case_id: number;
  relationship_type: SignalCaseRelationship;
  reviewer_notes?: string;
  user_id: number;
}) {
  await verifyCaseWriteAccess(input.case_id, input.user_id);
  const artifact = await read_signal_artifact(input.domain, input.record_id);
  const linkHash = createHash("sha256")
    .update([
      input.case_id,
      input.domain,
      input.record_id,
      input.relationship_type,
    ].join("|"))
    .digest("hex");
  const columns = domainColumns(input.domain);
  const pool = getPool();
  const values = {
    intake_signal_id:
      columns.intake_signal_id === "artifact" ? input.record_id : null,
    legal_pattern_id:
      columns.legal_pattern_id === "artifact" ? input.record_id : null,
    live_data_signal_id:
      columns.live_data_signal_id === "artifact" ? input.record_id : null,
    convergence_id:
      columns.convergence_id === "artifact" ? input.record_id : null,
  };
  const { rows } = await pool.query(
    `insert into public.signal_artifact_case_links_v1 (
       case_id, domain_code, intake_signal_id, legal_pattern_id,
       live_data_signal_id, convergence_id, relationship_type,
       reviewer_notes, linked_by_user_id, artifact_title_snapshot,
       artifact_type_snapshot, artifact_source_hash, link_hash
     ) values ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
               $7, $8, $9, $10, $11, $12, $13)
     on conflict (link_hash) do nothing
     returning link_id::text, case_id, domain_code, relationship_type,
               reviewer_notes, artifact_title_snapshot, artifact_type_snapshot,
               artifact_source_hash, link_hash, created_at`,
    [
      input.case_id,
      input.domain,
      values.intake_signal_id,
      values.legal_pattern_id,
      values.live_data_signal_id,
      values.convergence_id,
      input.relationship_type,
      input.reviewer_notes?.trim() ?? "",
      input.user_id,
      artifact.title,
      artifact.artifact_type,
      artifact.source_hash,
      linkHash,
    ],
  );
  if (rows[0]) return { ...rows[0], created: true };
  const existing = await pool.query(
    `select link_id::text, case_id, domain_code, relationship_type,
            reviewer_notes, artifact_title_snapshot, artifact_type_snapshot,
            artifact_source_hash, link_hash, created_at
       from public.signal_artifact_case_links_v1
      where link_hash = $1
      limit 1`,
    [linkHash],
  );
  return { ...existing.rows[0], created: false };
}

export async function list_case_signal_artifacts(input: {
  case_id: number;
  user_id: number;
}) {
  await verifyCaseOwnership(input.case_id, input.user_id);
  const pool = getPool();
  const { rows } = await pool.query(
    `select link_id::text,
            case_id,
            domain_code,
            coalesce(legal_pattern_id, live_data_signal_id, convergence_id,
                     intake_signal_id)::text as record_id,
            relationship_type,
            reviewer_notes,
            artifact_title_snapshot as title,
            artifact_type_snapshot as artifact_type,
            artifact_source_hash as source_hash,
            created_at
       from public.signal_artifact_case_links_v1
      where case_id = $1
      order by created_at desc, link_id desc`,
    [input.case_id],
  );
  return rows.map((row) => {
    const destination = signal_artifact_destination(
      row.domain_code as SignalArtifactDomain,
      String(row.artifact_type),
    );
    const query = new URLSearchParams({
      signal_domain: String(row.domain_code),
      signal_id: String(row.record_id),
    });
    return {
      ...row,
      created_at: wireDate(row.created_at),
      ...destination,
      destination_path: `${destination.home_path}?${query.toString()}`,
    };
  });
}
