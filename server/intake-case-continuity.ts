import { getPool } from "./db-legacy";
import { TRPCError } from "@trpc/server";
import {
  read_canonical_case_layer_outputs,
  type CanonicalCaseLayerOutput,
} from "./intake-case-layer-reader";
import { read_case_intake_integrity_projection } from "./intake-case-integrity-projection";
import type { VerificationRecord } from "./engines/intake-spine/layer-5-verification_gate";
import type { StateTransition } from "./engines/intake-spine/layer-9-state_timeline";

type case_reference = { case_id: number } | { case_uuid: string };

type linked_session_row = {
  legacy_case_id: number | string;
  case_uuid: string;
  intake_session_id: string;
  link_type: string;
  is_primary: boolean;
  session_type: string;
  entry_channel: string;
  source_label: string | null;
  session_status: string;
  completion_state: string;
  created_at: string;
  updated_at: string;
  artifact_count: number | string;
  source_artifact_count: number | string;
  layer_run_count: number | string;
  completed_layer_run_count: number | string;
  sealed_layer_run_count: number | string;
  failed_layer_run_count: number | string;
  pending_layer_run_count: number | string;
  layer_output_available_count: number | string;
  unresolved_dependency_count: number | string;
  stabilization_snapshot_count: number | string;
  active_stabilization_snapshot_count: number | string;
  pending_reassess_count: number | string;
  latest_reassess_at: string | null;
};

type bridge_row = {
  legacy_case_id: number | string;
  case_uuid: string;
};

type count_map = Record<string, number>;

export type case_intake_continuity_document_link = {
  document_id: number;
  href: string;
  filename: string | null;
  source_artifact_status: string;
  integrity_status: string | null;
};

export type case_intake_continuity_session = {
  intake_session_id: string;
  link_type: string;
  is_primary: boolean;
  session_type: string;
  entry_channel: string;
  source_label: string | null;
  session_status: string;
  completion_state: string;
  created_at: string;
  updated_at: string;
  artifact_count: number;
  source_artifact_count: number;
  artifact_status_counts: count_map;
  completed_layer_run_count: number;
  sealed_layer_run_count: number;
  failed_layer_run_count: number;
  pending_layer_run_count: number;
  layer_run_count: number;
  layer_output_available_count: number;
  unresolved_dependency_count: number;
  verification_state_counts: count_map;
  verification_record_count: number;
  transition_state_counts: count_map;
  transition_verification_counts: count_map;
  transition_count: number;
  stabilization_summary: {
    snapshot_count: number;
    active_snapshot_count: number;
    pending_reassess_count: number;
    latest_reassess_at: string | null;
    latest_transition_completed_at: string | null;
  };
  document_links: case_intake_continuity_document_link[];
};

export type case_intake_continuity = {
  case_id: number;
  case_uuid: string;
  primary_sessions: case_intake_continuity_session[];
  related_sessions: case_intake_continuity_session[];
  totals: {
    session_count: number;
    primary_session_count: number;
    related_session_count: number;
    artifact_count: number;
    source_artifact_count: number;
    artifact_status_counts: count_map;
    completed_layer_run_count: number;
    sealed_layer_run_count: number;
    failed_layer_run_count: number;
    pending_layer_run_count: number;
    layer_output_available_count: number;
    unresolved_dependency_count: number;
    verification_state_counts: count_map;
    verification_record_count: number;
    transition_state_counts: count_map;
    transition_verification_counts: count_map;
    transition_count: number;
    stabilization_snapshot_count: number;
    active_stabilization_snapshot_count: number;
    pending_reassess_count: number;
  };
  surface_links: {
    case_overview: string;
    documents: string;
    entities: string;
    timeline: string;
    network: string;
    findings: string;
    review: string;
    act: string;
  };
};

function as_count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function count_value(counts: count_map, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function merge_counts(target: count_map, counts: count_map) {
  for (const [key, value] of Object.entries(counts)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function case_surface_href(path: string, case_id: number) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}caseId=${encodeURIComponent(String(case_id))}`;
}

function session_sort(
  left: case_intake_continuity_session,
  right: case_intake_continuity_session,
) {
  return (
    Date.parse(right.created_at) - Date.parse(left.created_at)
    || right.intake_session_id.localeCompare(left.intake_session_id)
  );
}

function verification_counts_by_session(
  outputs: CanonicalCaseLayerOutput<VerificationRecord[]>[],
) {
  const by_session = new Map<string, { counts: count_map; total: number }>();
  for (const output of outputs) {
    const entry = by_session.get(output.intake_session_id) ?? {
      counts: {},
      total: 0,
    };
    for (const record of Array.isArray(output.data) ? output.data : []) {
      if (!record || typeof record.verification_state !== "string") continue;
      count_value(entry.counts, record.verification_state);
      entry.total += 1;
    }
    by_session.set(output.intake_session_id, entry);
  }
  return by_session;
}

function transition_counts_by_session(
  outputs: CanonicalCaseLayerOutput<StateTransition[]>[],
) {
  const by_session = new Map<
    string,
    {
      state_counts: count_map;
      verification_counts: count_map;
      total: number;
      latest_completed_at: string | null;
    }
  >();
  for (const output of outputs) {
    const entry = by_session.get(output.intake_session_id) ?? {
      state_counts: {},
      verification_counts: {},
      total: 0,
      latest_completed_at: null,
    };
    for (const record of Array.isArray(output.data) ? output.data : []) {
      if (!record) continue;
      if (typeof record.to_state === "string" && record.to_state) {
        count_value(entry.state_counts, record.to_state);
      }
      if (
        typeof record.verification_status === "string"
        && record.verification_status
      ) {
        count_value(entry.verification_counts, record.verification_status);
      }
      entry.total += 1;
    }
    const completed_at =
      output.completed_at === null || output.completed_at === undefined
        ? null
        : String(output.completed_at);
    if (
      completed_at
      && (!entry.latest_completed_at
        || Date.parse(completed_at) > Date.parse(entry.latest_completed_at))
    ) {
      entry.latest_completed_at = completed_at;
    }
    by_session.set(output.intake_session_id, entry);
  }
  return by_session;
}

async function load_case_bridge(reference: case_reference) {
  const legacy_case_id = "case_id" in reference ? reference.case_id : null;
  const case_uuid = "case_uuid" in reference ? reference.case_uuid : null;
  const result = await getPool().query<bridge_row>(
   `select legacy_case_id, case_uuid::text as case_uuid
      from public.case_identity_bridge
     where ($1::integer is not null and legacy_case_id = $1)
        or ($2::uuid is not null and case_uuid = $2::uuid)
     limit 1`,
   [legacy_case_id, case_uuid],
  );
  return result.rows[0] ?? null;
}

async function load_linked_sessions(bridge: bridge_row) {
  const result = await getPool().query<linked_session_row>(
   `with linked_sessions as (
       select
         $1::integer as legacy_case_id,
         $2::uuid::text as case_uuid,
         cil.intake_session_id::text,
         cil.link_type,
         cil.is_primary,
         s.session_type,
         s.entry_channel,
         s.source_label,
         s.session_status,
         s.completion_state,
         s.created_at::text,
         s.updated_at::text
       from public.case_intake_links cil
       join public.intake_sessions s on s.intake_session_id = cil.intake_session_id
       where cil.case_uuid = $2::uuid
     ), latest_layer_runs as (
       select *
         from (
           select
             lr.*,
             row_number() over (
               partition by lr.intake_session_id, lr.layer_name
               order by lr.sealed_at desc nulls last,
                        lr.completed_at desc nulls last,
                        lr.started_at desc nulls last,
                        lr.layer_run_id desc
             ) as layer_rank
           from public.intake_layer_runs lr
           join linked_sessions ls on ls.intake_session_id = lr.intake_session_id::text
         ) ranked
        where layer_rank = 1
     ), artifact_counts as (
       select
         ls.intake_session_id,
         count(ia.artifact_id)::integer as artifact_count,
         count(ia.artifact_id) filter (where ia.artifact_type = 'source_document')::integer as source_artifact_count
       from linked_sessions ls
       left join public.intake_artifacts ia on ia.intake_session_id = ls.intake_session_id::uuid
       group by ls.intake_session_id
     ), layer_run_totals as (
       select
         ls.intake_session_id,
         count(lr.layer_run_id)::integer as layer_run_count,
         count(lr.layer_run_id) filter (where lower(coalesce(lr.run_status, '')) = 'completed')::integer as completed_layer_run_count,
         count(lr.layer_run_id) filter (
           where lower(coalesce(lr.run_status, '')) = 'completed'
             and lr.is_sealed = true
         )::integer as sealed_layer_run_count,
         count(lr.layer_run_id) filter (
           where lower(coalesce(lr.run_status, '')) in ('failed', 'error')
         )::integer as failed_layer_run_count,
         count(lr.layer_run_id) filter (
           where lower(coalesce(lr.run_status, '')) not in ('completed', 'failed', 'error', 'superseded')
         )::integer as pending_layer_run_count
       from linked_sessions ls
       left join public.intake_layer_runs lr on lr.intake_session_id = ls.intake_session_id::uuid
       group by ls.intake_session_id
     ), latest_layer_summary as (
       select
         ls.intake_session_id,
         count(llr.layer_run_id) filter (
           where jsonb_typeof(coalesce(llr.output_refs, '[]'::jsonb)) = 'array'
             and jsonb_array_length(coalesce(llr.output_refs, '[]'::jsonb)) > 0
         )::integer as layer_output_available_count,
         coalesce(sum(
           case
             when jsonb_typeof(coalesce(llr.unresolved_dependencies, '[]'::jsonb)) = 'array'
             then jsonb_array_length(coalesce(llr.unresolved_dependencies, '[]'::jsonb))
             else 0
           end
         ), 0)::integer as unresolved_dependency_count
       from linked_sessions ls
       left join latest_layer_runs llr on llr.intake_session_id = ls.intake_session_id::uuid
       group by ls.intake_session_id
     ), stabilization_summary as (
       select
         ls.intake_session_id,
         count(ss.stabilization_snapshot_id)::integer as stabilization_snapshot_count,
         count(ss.stabilization_snapshot_id) filter (
           where ss.snapshot_status = 'active'
         )::integer as active_stabilization_snapshot_count,
         count(ss.stabilization_snapshot_id) filter (
           where ss.snapshot_status = 'active'
             and ss.reassess_at is not null
             and ss.reassess_at <= now()
         )::integer as pending_reassess_count,
         max(ss.reassess_at)::text as latest_reassess_at
       from linked_sessions ls
       left join public.stabilization_snapshots ss on ss.intake_session_id = ls.intake_session_id::uuid
       group by ls.intake_session_id
     )
     select
       ls.legacy_case_id,
       ls.case_uuid,
       ls.intake_session_id,
       ls.link_type,
       ls.is_primary,
       ls.session_type,
       ls.entry_channel,
       ls.source_label,
       ls.session_status,
       ls.completion_state,
       ls.created_at,
       ls.updated_at,
       coalesce(ac.artifact_count, 0) as artifact_count,
       coalesce(ac.source_artifact_count, 0) as source_artifact_count,
       coalesce(lrt.layer_run_count, 0) as layer_run_count,
       coalesce(lrt.completed_layer_run_count, 0) as completed_layer_run_count,
       coalesce(lrt.sealed_layer_run_count, 0) as sealed_layer_run_count,
       coalesce(lrt.failed_layer_run_count, 0) as failed_layer_run_count,
       coalesce(lrt.pending_layer_run_count, 0) as pending_layer_run_count,
       coalesce(lls.layer_output_available_count, 0) as layer_output_available_count,
       coalesce(lls.unresolved_dependency_count, 0) as unresolved_dependency_count,
       coalesce(ss.stabilization_snapshot_count, 0) as stabilization_snapshot_count,
       coalesce(ss.active_stabilization_snapshot_count, 0) as active_stabilization_snapshot_count,
       coalesce(ss.pending_reassess_count, 0) as pending_reassess_count,
       ss.latest_reassess_at
     from linked_sessions ls
     left join artifact_counts ac on ac.intake_session_id = ls.intake_session_id
     left join layer_run_totals lrt on lrt.intake_session_id = ls.intake_session_id
     left join latest_layer_summary lls on lls.intake_session_id = ls.intake_session_id
     left join stabilization_summary ss on ss.intake_session_id = ls.intake_session_id
     order by ls.is_primary desc, ls.created_at desc, ls.intake_session_id desc`,
    [as_count(bridge.legacy_case_id), bridge.case_uuid],
  );
  return result.rows;
}

export async function read_case_intake_continuity(
  reference: case_reference,
): Promise<case_intake_continuity> {
  const bridge_row = await load_case_bridge(reference);
  if (!bridge_row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "case_intake_continuity_bridge_not_found",
    });
  }

  const case_id = as_count(bridge_row.legacy_case_id);
  const session_rows = await load_linked_sessions(bridge_row);
  const integrity = await read_case_intake_integrity_projection(case_id, {
    link_scope: "all",
  });
  const [verification, transitions] = await Promise.all([
    read_canonical_case_layer_outputs<VerificationRecord[]>(
      case_id,
      "verification_gate",
      { link_scope: "all" },
    ),
    read_canonical_case_layer_outputs<StateTransition[]>(
      case_id,
      "state_timeline",
      { link_scope: "all" },
    ),
  ]);

  const artifact_status_by_session = new Map<string, count_map>();
  const case_document_link_session_ids = new Set(
    session_rows
      .filter((row) =>
        Boolean(row.is_primary)
        || (
          row.session_type !== "clean_room"
          && row.link_type !== "clean_room_restart"
        ))
      .map((row) => row.intake_session_id),
  );
  const document_links_by_session = new Map<
    string,
    case_intake_continuity_document_link[]
  >();
  for (const artifact of integrity.artifacts) {
    const session_counts =
      artifact_status_by_session.get(artifact.intake_session_id) ?? {};
    count_value(
      session_counts,
      artifact.integrity_status ?? artifact.source_artifact_status,
    );
    artifact_status_by_session.set(artifact.intake_session_id, session_counts);
    if (
      artifact.legacy_document_id === null
      || !case_document_link_session_ids.has(artifact.intake_session_id)
    ) {
      continue;
    }
    const links = document_links_by_session.get(artifact.intake_session_id) ?? [];
    links.push({
      document_id: artifact.legacy_document_id,
      href: case_surface_href(`/documents/${artifact.legacy_document_id}`, case_id),
      filename: artifact.filename,
      source_artifact_status: artifact.source_artifact_status,
      integrity_status: artifact.integrity_status,
    });
    document_links_by_session.set(artifact.intake_session_id, links);
  }

  const verification_by_session = verification_counts_by_session(
    verification.outputs,
  );
  const transitions_by_session = transition_counts_by_session(transitions.outputs);

  const totals: case_intake_continuity["totals"] = {
    session_count: session_rows.length,
    primary_session_count: 0,
    related_session_count: 0,
    artifact_count: 0,
    source_artifact_count: 0,
    artifact_status_counts: {},
    completed_layer_run_count: 0,
    sealed_layer_run_count: 0,
    failed_layer_run_count: 0,
    pending_layer_run_count: 0,
    layer_output_available_count: 0,
    unresolved_dependency_count: 0,
    verification_state_counts: {},
    verification_record_count: 0,
    transition_state_counts: {},
    transition_verification_counts: {},
    transition_count: 0,
    stabilization_snapshot_count: 0,
    active_stabilization_snapshot_count: 0,
    pending_reassess_count: 0,
  };
  const primary_sessions: case_intake_continuity_session[] = [];
  const related_sessions: case_intake_continuity_session[] = [];

  for (const row of session_rows) {
    const verification_counts = verification_by_session.get(row.intake_session_id) ?? {
      counts: {},
      total: 0,
    };
    const transition_counts = transitions_by_session.get(row.intake_session_id) ?? {
      state_counts: {},
      verification_counts: {},
      total: 0,
      latest_completed_at: null,
    };
    const session = {
      intake_session_id: row.intake_session_id,
      link_type: row.link_type,
      is_primary: Boolean(row.is_primary),
      session_type: row.session_type,
      entry_channel: row.entry_channel,
      source_label: row.source_label,
      session_status: row.session_status,
      completion_state: row.completion_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
      artifact_count: as_count(row.artifact_count),
      source_artifact_count: as_count(row.source_artifact_count),
      artifact_status_counts:
        artifact_status_by_session.get(row.intake_session_id) ?? {},
      completed_layer_run_count: as_count(row.completed_layer_run_count),
      sealed_layer_run_count: as_count(row.sealed_layer_run_count),
      failed_layer_run_count: as_count(row.failed_layer_run_count),
      pending_layer_run_count: as_count(row.pending_layer_run_count),
      layer_run_count: as_count(row.layer_run_count),
      layer_output_available_count: as_count(row.layer_output_available_count),
      unresolved_dependency_count: as_count(row.unresolved_dependency_count),
      verification_state_counts: verification_counts.counts,
      verification_record_count: verification_counts.total,
      transition_state_counts: transition_counts.state_counts,
      transition_verification_counts: transition_counts.verification_counts,
      transition_count: transition_counts.total,
      stabilization_summary: {
        snapshot_count: as_count(row.stabilization_snapshot_count),
        active_snapshot_count: as_count(row.active_stabilization_snapshot_count),
        pending_reassess_count: as_count(row.pending_reassess_count),
        latest_reassess_at: row.latest_reassess_at,
        latest_transition_completed_at: transition_counts.latest_completed_at,
      },
      document_links: (document_links_by_session.get(row.intake_session_id) ?? [])
        .sort((left, right) => left.document_id - right.document_id),
    } satisfies case_intake_continuity_session;

    if (session.is_primary) totals.primary_session_count += 1;
    else totals.related_session_count += 1;
    totals.artifact_count += session.artifact_count;
    totals.source_artifact_count += session.source_artifact_count;
    totals.completed_layer_run_count += session.completed_layer_run_count;
    totals.sealed_layer_run_count += session.sealed_layer_run_count;
    totals.failed_layer_run_count += session.failed_layer_run_count;
    totals.pending_layer_run_count += session.pending_layer_run_count;
    totals.layer_output_available_count += session.layer_output_available_count;
    totals.unresolved_dependency_count += session.unresolved_dependency_count;
    totals.verification_record_count += session.verification_record_count;
    totals.transition_count += session.transition_count;
    totals.stabilization_snapshot_count +=
      session.stabilization_summary.snapshot_count;
    totals.active_stabilization_snapshot_count +=
      session.stabilization_summary.active_snapshot_count;
    totals.pending_reassess_count +=
      session.stabilization_summary.pending_reassess_count;
    merge_counts(totals.artifact_status_counts, session.artifact_status_counts);
    merge_counts(
      totals.verification_state_counts,
      session.verification_state_counts,
    );
    merge_counts(totals.transition_state_counts, session.transition_state_counts);
    merge_counts(
      totals.transition_verification_counts,
      session.transition_verification_counts,
    );
    if (session.is_primary) primary_sessions.push(session);
    else related_sessions.push(session);
  }

  return {
    case_id,
    case_uuid: String(bridge_row.case_uuid),
    primary_sessions: primary_sessions.sort(session_sort),
    related_sessions: related_sessions.sort(session_sort),
    totals,
    surface_links: {
      case_overview: case_surface_href("/case-overview", case_id),
      documents: case_surface_href("/documents", case_id),
      entities: case_surface_href("/entities", case_id),
      timeline: case_surface_href("/timeline", case_id),
      network: case_surface_href("/network", case_id),
      findings: case_surface_href("/findings", case_id),
      review: case_surface_href("/control-room", case_id),
      act: case_surface_href("/guide/" + case_id, case_id),
    },
  };
}
