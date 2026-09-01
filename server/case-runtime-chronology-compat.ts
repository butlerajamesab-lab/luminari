import { TRPCError } from "@trpc/server";

import { getPool } from "./db-legacy";
import { computeHash } from "./engines/intake-spine/utils";
import {
  read_case_intake_integrity_projection,
} from "./intake-case-integrity-projection";

const EXECUTION_CONTRACT_VERSION = "luminari.intake.layer-execution.v1";
const CANONICALIZATION_VERSION = "luminari.intake.canonical-json.v2";

type ChronologyEvent = {
  event_id: string;
  date: string | null;
  date_precision: "exact" | "month" | "year" | "unknown";
  event_text: string;
  actor: string | null;
  source_artifact_key: string;
  source_span_offset: number;
  verification_status: string;
};

type MergedChronologyEvent = ChronologyEvent & {
  source_intake_session_ids: string[];
  canonical_projection_variant_id: string;
};

function projection_error(message: string, cause?: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Intake Spine chronology projection integrity failure: ${message}`,
    cause,
  });
}

function as_array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function load_canonical_chronology_outputs(case_id: number): Promise<{
  state: "not_projected" | "canonical_projection";
  outputs: Array<{
    intake_session_id: string;
    layer_run_id: string;
    output_hash: string;
    receipt_hash: string;
    layer_version: string;
    data: ChronologyEvent[];
  }>;
}> {
  const result = await getPool().query(
    `with linked_sessions as (
       select cil.intake_session_id
         from public.case_identity_bridge cib
         join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
         join public.intake_sessions s on s.intake_session_id = cil.intake_session_id
        where cib.legacy_case_id = $1
          and cil.is_primary = true
          and cil.link_type = 'primary_projection'
          and s.session_type = 'live'
          and s.entry_channel = 'upload'
          and s.completion_state = 'governed_execution_complete'
     ), ranked as (
       select lr.*,
              row_number() over (
                partition by lr.intake_session_id, lr.layer_name
                order by lr.sealed_at desc nulls last,
                         lr.completed_at desc nulls last,
                         lr.started_at desc nulls last,
                         lr.layer_run_id desc
              ) as projection_rank
         from linked_sessions ls
         join public.intake_layer_runs lr on lr.intake_session_id = ls.intake_session_id
        where lr.layer_name = 'chronology_reconstruction'
          and lr.run_status = 'completed'
          and lr.is_sealed = true
     )
     select
       r.intake_session_id::text,
       r.layer_run_id::text,
       r.layer_version,
       r.rule_version,
       r.output_hash,
       r.output_refs,
       r.receipt,
       r.receipt_hash,
       r.canonicalization_version,
       a.artifact_id::text as output_artifact_id,
       a.artifact_type,
       a.artifact_status,
       a.metadata
     from ranked r
     left join public.intake_artifacts a
       on a.artifact_id = case
         when coalesce(r.receipt ->> 'output_artifact_id', '') ~
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then (r.receipt ->> 'output_artifact_id')::uuid
         else null
       end
     where r.projection_rank = 1
     order by r.intake_session_id`,
    [case_id],
  );

  const eligible = result.rows.filter((row: any) =>
    row.receipt?.receipt_type === "layer_execution"
      && row.receipt?.execution_contract_version === EXECUTION_CONTRACT_VERSION
      && row.canonicalization_version === CANONICALIZATION_VERSION,
  );
  if (eligible.length === 0) return { state: "not_projected", outputs: [] };

  const outputs = eligible.map((row: any) => {
    const metadata = row.metadata ?? {};
    const output_refs = as_array(row.output_refs);
    if (!row.receipt_hash || !/^[0-9a-f]{64}$/.test(row.receipt_hash)) {
      projection_error(`run ${row.layer_run_id} is missing its sealed receipt hash`);
    }
    if (!row.output_artifact_id || row.artifact_type !== "intake_layer_output" || row.artifact_status !== "preserved") {
      projection_error(`run ${row.layer_run_id} is missing its preserved output artifact`);
    }
    if (row.receipt.output_artifact_id !== row.output_artifact_id
        || output_refs.length !== 1
        || String(output_refs[0]?.artifact_id ?? "") !== row.output_artifact_id) {
      projection_error(`run ${row.layer_run_id} output reference identity mismatch`);
    }
    if (metadata.execution_contract_version !== EXECUTION_CONTRACT_VERSION
        || metadata.canonicalization_version !== CANONICALIZATION_VERSION
        || metadata.layer_name !== "chronology_reconstruction"
        || metadata.layer_version !== row.layer_version
        || metadata.rule_version !== row.rule_version
        || metadata.output_hash !== row.output_hash) {
      projection_error(`run ${row.layer_run_id} output artifact metadata mismatch`);
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, "data") || !Array.isArray(metadata.data)) {
      projection_error(`run ${row.layer_run_id} has no canonical chronology array`);
    }
    let recomputed_hash: string;
    try {
      recomputed_hash = computeHash(metadata.data);
    } catch (error) {
      projection_error(`run ${row.layer_run_id} chronology data cannot be canonically hashed`, error);
    }
    if (recomputed_hash !== row.output_hash) {
      projection_error(`run ${row.layer_run_id} chronology output hash mismatch`);
    }
    return {
      intake_session_id: String(row.intake_session_id),
      layer_run_id: String(row.layer_run_id),
      output_hash: String(row.output_hash),
      receipt_hash: String(row.receipt_hash),
      layer_version: String(row.layer_version),
      data: metadata.data as ChronologyEvent[],
    };
  });

  return { state: "canonical_projection", outputs };
}

async function load_source_document_bindings(case_id: number) {
  const [result, integrity] = await Promise.all([
    getPool().query(
      `select a.intake_session_id::text,
            a.artifact_id::text,
            a.artifact_key,
            a.filename,
            a.metadata
       from public.case_identity_bridge cib
       join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
       join public.intake_sessions s on s.intake_session_id = cil.intake_session_id
       join public.intake_artifacts a on a.intake_session_id = cil.intake_session_id
       join public.documents d
         on coalesce(a.metadata ->> 'legacy_document_id', '') ~ '^[0-9]+$'
        and d.id = (a.metadata ->> 'legacy_document_id')::integer
        and d.case_id = cib.legacy_case_id
      where cib.legacy_case_id = $1
        and cil.is_primary = true
        and cil.link_type = 'primary_projection'
        and s.session_type = 'live'
        and s.entry_channel = 'upload'
        and a.artifact_type = 'source_document'
        and a.artifact_status in ('registered', 'preserved')
        and coalesce(d.document_resolution, 'active') = 'active'
      order by a.artifact_key, a.artifact_id`,
      [case_id],
    ),
    read_case_intake_integrity_projection(case_id),
  ]);
  const preserved_artifacts = new Set(
    integrity.artifacts.flatMap(artifact =>
      artifact.integrity_status === "preserved"
        ? [
            `${artifact.intake_session_id}\u001f${artifact.artifact_id}\u001f${artifact.artifact_key}`,
          ]
        : [],
    ),
  );
  const by_artifact = new Map<string, any[]>();
  for (const row of result.rows) {
    const identity = `${String(row.intake_session_id)}\u001f${String(row.artifact_id)}\u001f${String(row.artifact_key)}`;
    if (!preserved_artifacts.has(identity)) continue;
    const binding_key = `${String(row.intake_session_id)}\u001f${String(row.artifact_key)}`;
    const list = by_artifact.get(binding_key) ?? [];
    list.push(row);
    by_artifact.set(binding_key, list);
  }
  return by_artifact;
}

function source_binding(rows: any[] | undefined): { document_id: number | null; filename: string | null } {
  if (!rows || rows.length === 0) return { document_id: null, filename: null };
  const document_ids = [...new Set(rows
    .map(row => Number(row.metadata?.legacy_document_id))
    .filter(value => Number.isSafeInteger(value) && value > 0))];
  const filenames = [...new Set(rows.map(row => row.filename).filter(Boolean))];
  return {
    document_id: document_ids.length === 1 ? document_ids[0] : null,
    filename: filenames.length === 1 ? String(filenames[0]) : null,
  };
}

function source_binding_for_event(
  bindings: Map<string, any[]>,
  event: MergedChronologyEvent,
): {
  document_id: number | null;
  filename: string | null;
  intake_session_id: string | null;
} {
  for (const intake_session_id of event.source_intake_session_ids) {
    const binding = source_binding(
      bindings.get(
        `${intake_session_id}\u001f${event.source_artifact_key}`,
      ),
    );
    if (binding.document_id !== null) {
      return { ...binding, intake_session_id };
    }
  }
  return { document_id: null, filename: null, intake_session_id: null };
}

function merge_chronology(
  outputs: Array<{ intake_session_id: string; data: ChronologyEvent[] }>,
): MergedChronologyEvent[] {
  const events = new Map<
    string,
    {
      event: ChronologyEvent;
      payload_hash: string;
      intake_session_ids: Set<string>;
    }
  >();
  for (const output of outputs) {
    for (const event of output.data) {
      if (!event || typeof event.event_id !== "string" || typeof event.event_text !== "string") {
        projection_error("canonical chronology contains an invalid event row");
      }
      const payload_hash = computeHash(event);
      const variant_identity = `${event.event_id}\u001f${payload_hash}`;
      const existing = events.get(variant_identity);
      if (!existing) {
        events.set(variant_identity, {
          event,
          payload_hash,
          intake_session_ids: new Set([output.intake_session_id]),
        });
        continue;
      }
      existing.intake_session_ids.add(output.intake_session_id);
    }
  }
  const variant_counts = new Map<string, number>();
  for (const { event } of events.values()) {
    variant_counts.set(
      event.event_id,
      (variant_counts.get(event.event_id) ?? 0) + 1,
    );
  }
  return [...events.values()].map(
    ({ event, payload_hash, intake_session_ids }) => ({
      ...event,
      source_intake_session_ids: [...intake_session_ids].sort(),
      canonical_projection_variant_id:
        (variant_counts.get(event.event_id) ?? 0) > 1
          ? `${event.event_id}@${payload_hash.slice(0, 16)}`
          : event.event_id,
    }),
  ).sort((left, right) =>
    (left.date ?? "9999-99-99").localeCompare(right.date ?? "9999-99-99")
      || left.source_artifact_key.localeCompare(right.source_artifact_key)
      || left.source_span_offset - right.source_span_offset
      || left.event_id.localeCompare(right.event_id)
      || left.canonical_projection_variant_id.localeCompare(
        right.canonical_projection_variant_id,
      ),
  );
}

export async function getCaseChronologyProjectionState(caseId: number): Promise<{
  projection_state: "not_projected" | "canonical_projection";
  event_count: number;
  canonical_output_hashes: string[];
  canonical_receipt_hashes: string[];
}> {
  const canonical = await load_canonical_chronology_outputs(caseId);
  const bindings =
    canonical.state === "canonical_projection"
      ? await load_source_document_bindings(caseId)
      : new Map<string, any[]>();
  return {
    projection_state: canonical.state,
    event_count: canonical.state === "canonical_projection"
      ? merge_chronology(canonical.outputs).filter(
          event =>
            source_binding_for_event(bindings, event).document_id !== null,
        ).length
      : 0,
    canonical_output_hashes: [...new Set(canonical.outputs.map(output => output.output_hash))].sort(),
    canonical_receipt_hashes: [...new Set(canonical.outputs.map(output => output.receipt_hash))].sort(),
  };
}

export async function listEvents(caseId: number) {
  const canonical = await load_canonical_chronology_outputs(caseId);
  if (canonical.state === "not_projected") return [];

  const bindings = await load_source_document_bindings(caseId);
  const output_hashes = [...new Set(canonical.outputs.map(output => output.output_hash))].sort();
  const receipt_hashes = [...new Set(canonical.outputs.map(output => output.receipt_hash))].sort();
  const layer_versions = [...new Set(canonical.outputs.map(output => output.layer_version))].sort();

  return merge_chronology(canonical.outputs).flatMap(event => {
    const binding = source_binding_for_event(bindings, event);
    if (binding.document_id === null) return [];
    return [{
      id: event.canonical_projection_variant_id,
      caseId,
      title: event.event_text,
      description: null,
      dateOccurred: event.date,
      eventType: "source_document_event",
      location: null,
      documentId: binding.document_id,
      documentFilename: binding.filename,
      projection_source: "universal_intake_spine",
      canonical_event_id: event.event_id,
      canonical_projection_variant_id:
        event.canonical_projection_variant_id,
      canonical_date_precision: event.date_precision,
      canonical_verification_status: event.verification_status,
      canonical_actor: event.actor,
      canonical_source_artifact_key: event.source_artifact_key,
      canonical_source_intake_session_id: binding.intake_session_id,
      canonical_source_intake_session_ids: event.source_intake_session_ids,
      canonical_source_span_offset: event.source_span_offset,
      canonical_output_hashes: output_hashes,
      canonical_receipt_hashes: receipt_hashes,
      canonical_layer_versions: layer_versions,
    }];
  });
}
