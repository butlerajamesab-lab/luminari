import { getPool } from "./db-legacy";
import { autoDetect, type PipelineSuggestion } from "./intake-autodetect";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";
import type { ChronologyEvent } from "./engines/intake-spine/layer-4-chronology_reconstruction";
import type { Entity } from "./engines/intake-spine/layer-6-entity_registry";
import type { Relationship } from "./engines/intake-spine/layer-7-relationship_graph";
import type { StateTransition } from "./engines/intake-spine/layer-9-state_timeline";

export const CASE_PIPELINE_CANDIDATE_CONTRACT_VERSION = "luminari.case.pipeline-candidate.v1";

export type CasePipelineEvidenceRef = {
  evidence_kind: "case_metadata" | "chronology_event" | "relationship" | "state_transition" | "entity_mention";
  source_id: string;
  source_artifact_key: string | null;
  source_span_offset: number | null;
  source_text: string;
  matched_terms: string[];
  scope: "case_specific" | "facility_wide" | "case_metadata" | "unknown";
};

export type CasePipelineCandidate = {
  pipeline_id: string;
  category: string;
  label: string;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  candidate_state: "candidate_unverified";
  basis_state: "case_source_match" | "metadata_only";
  match_reasons: string[];
  matched_signals: string[];
  evidence_refs: CasePipelineEvidenceRef[];
  reviewed_route_count: number;
  reviewed_access_point_count: number;
  reviewed_pipeline_intelligence_state:
    | "reviewed_pipeline_intelligence_available"
    | "reviewed_pipeline_intelligence_unavailable";
};

export type CasePipelineCandidateProjection = {
  contract_version: typeof CASE_PIPELINE_CANDIDATE_CONTRACT_VERSION;
  projection_state: "not_projected" | "canonical_projection";
  selected_pipeline_key: string | null;
  selected_pipeline_source: "cases.pipeline_type" | null;
  candidate_pipeline_does_not_establish_claim: true;
  facility_wide_context_is_not_case_specific: true;
  source_counts: {
    case_specific_events: number;
    facility_wide_events: number;
    relationships: number;
    case_specific_transitions: number;
    facility_wide_transitions: number;
    entities: number;
  };
  candidates: CasePipelineCandidate[];
  source_receipts: Array<{
    layer_name: string;
    intake_session_id: string;
    layer_run_id: string;
    output_hash: string;
    receipt_hash: string;
  }>;
};

type EvidenceUnit = {
  evidence_kind: CasePipelineEvidenceRef["evidence_kind"];
  source_id: string;
  source_artifact_key: string | null;
  source_span_offset: number | null;
  source_text: string;
  scope: CasePipelineEvidenceRef["scope"];
};

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matched_terms(suggestion: PipelineSuggestion): string[] {
  const terms = new Set<string>();
  for (const signal of suggestion.matched_signals) {
    const match = /^(?:primary|secondary|entity|document):(.+)\(-?\d+\)$/.exec(signal);
    if (match?.[1]) terms.add(normalized(match[1]));
  }
  return [...terms].filter(Boolean).sort();
}

function evidence_for_suggestion(
  suggestion: PipelineSuggestion,
  units: EvidenceUnit[],
): CasePipelineEvidenceRef[] {
  const terms = matched_terms(suggestion);
  if (terms.length === 0) return [];
  const refs: CasePipelineEvidenceRef[] = [];
  for (const unit of units) {
    const haystack = normalized(unit.source_text);
    const hits = terms.filter(term => haystack.includes(term));
    if (hits.length === 0) continue;
    refs.push({ ...unit, matched_terms: hits });
  }
  return refs
    .sort((a, b) =>
      Number(a.evidence_kind === "case_metadata") - Number(b.evidence_kind === "case_metadata")
      || b.matched_terms.length - a.matched_terms.length
      || a.source_id.localeCompare(b.source_id),
    )
    .slice(0, 12);
}

export function derive_case_pipeline_candidates(input: {
  case_name: string | null;
  case_domain: string | null;
  selected_pipeline_key: string | null;
  chronology: ChronologyEvent[];
  entities: Entity[];
  relationships: Relationship[];
  transitions: StateTransition[];
  reviewed_routes?: Map<string, { route_count: number; access_point_count: number }>;
  max_candidates?: number;
}): {
  candidates: CasePipelineCandidate[];
  source_counts: CasePipelineCandidateProjection["source_counts"];
} {
  const case_specific_events = input.chronology.filter(event => event.event_scope !== "facility_wide");
  const facility_wide_events = input.chronology.filter(event => event.event_scope === "facility_wide");
  const case_specific_transitions = input.transitions.filter(transition => transition.transition_scope !== "facility_wide");
  const facility_wide_transitions = input.transitions.filter(transition => transition.transition_scope === "facility_wide");

  const units: EvidenceUnit[] = [];
  if (input.case_name) {
    units.push({
      evidence_kind: "case_metadata",
      source_id: "cases.name",
      source_artifact_key: null,
      source_span_offset: null,
      source_text: input.case_name,
      scope: "case_metadata",
    });
  }
  if (input.case_domain) {
    units.push({
      evidence_kind: "case_metadata",
      source_id: "cases.domain",
      source_artifact_key: null,
      source_span_offset: null,
      source_text: input.case_domain,
      scope: "case_metadata",
    });
  }
  for (const event of case_specific_events) {
    units.push({
      evidence_kind: "chronology_event",
      source_id: event.event_id,
      source_artifact_key: event.source_artifact_key,
      source_span_offset: event.source_span_offset,
      source_text: event.event_text,
      scope: event.event_scope ?? "unknown",
    });
  }
  for (const relationship of input.relationships) {
    units.push({
      evidence_kind: "relationship",
      source_id: relationship.relationship_id,
      source_artifact_key: relationship.source_refs[0]?.artifact_key ?? null,
      source_span_offset: relationship.source_refs[0]?.span_start_offset ?? null,
      source_text: [
        relationship.type.replaceAll("_", " "),
        relationship.role_a.replaceAll("_", " "),
        relationship.role_b.replaceAll("_", " "),
        ...relationship.source_refs.map(ref => ref.span_text),
      ].join(" "),
      scope: "case_specific",
    });
  }
  for (const transition of case_specific_transitions) {
    units.push({
      evidence_kind: "state_transition",
      source_id: transition.transition_id,
      source_artifact_key: transition.source_artifact_key,
      source_span_offset: transition.source_span_offset,
      source_text: `${transition.to_state.replaceAll("_", " ")} ${transition.source_text}`,
      scope: transition.transition_scope ?? "unknown",
    });
  }
  for (const entity of input.entities) {
    for (const mention of entity.raw_mentions.slice(0, 4)) {
      units.push({
        evidence_kind: "entity_mention",
        source_id: `${entity.entity_id}:${mention.artifact_key}:${mention.span_offset}`,
        source_artifact_key: mention.artifact_key,
        source_span_offset: mention.span_offset,
        source_text: `${entity.canonical_name} ${entity.type} ${mention.source_context ?? mention.raw_text}`,
        scope: "unknown",
      });
    }
  }

  const combined_text = units.map(unit => unit.source_text).join("\n");
  const detection = autoDetect({ combined_text }, undefined, input.max_candidates ?? 10);
  const reviewed_routes = input.reviewed_routes ?? new Map();

  const candidates = detection.suggestions.map(suggestion => {
    const evidence_refs = evidence_for_suggestion(suggestion, units);
    const reviewed = reviewed_routes.get(suggestion.pipeline_id) ?? { route_count: 0, access_point_count: 0 };
    return {
      pipeline_id: suggestion.pipeline_id,
      category: suggestion.category,
      label: suggestion.label,
      confidence: suggestion.confidence,
      confidence_label: suggestion.confidence_label,
      candidate_state: "candidate_unverified" as const,
      basis_state: evidence_refs.some(ref => ref.evidence_kind !== "case_metadata")
        ? "case_source_match" as const
        : "metadata_only" as const,
      match_reasons: suggestion.match_reasons,
      matched_signals: suggestion.matched_signals,
      evidence_refs,
      reviewed_route_count: reviewed.route_count,
      reviewed_access_point_count: reviewed.access_point_count,
      reviewed_pipeline_intelligence_state: reviewed.route_count > 0
        ? "reviewed_pipeline_intelligence_available" as const
        : "reviewed_pipeline_intelligence_unavailable" as const,
    };
  });

  return {
    candidates,
    source_counts: {
      case_specific_events: case_specific_events.length,
      facility_wide_events: facility_wide_events.length,
      relationships: input.relationships.length,
      case_specific_transitions: case_specific_transitions.length,
      facility_wide_transitions: facility_wide_transitions.length,
      entities: input.entities.length,
    },
  };
}

function receipt_rows(reads: Array<{ layer_name: string; outputs: Array<any> }>) {
  return reads.flatMap(read => read.outputs.map(output => ({
    layer_name: read.layer_name,
    intake_session_id: output.intake_session_id,
    layer_run_id: output.layer_run_id,
    output_hash: output.output_hash,
    receipt_hash: output.receipt_hash,
  })));
}

export async function read_case_pipeline_candidate_projection(
  case_id: number,
): Promise<CasePipelineCandidateProjection> {
  const [case_result, chronology_read, entity_read, relationship_read, transition_read] = await Promise.all([
    getPool().query<{ name: string | null; domain: string | null; pipeline_type: string | null }>(
      `select name, domain, nullif(btrim(pipeline_type), '') as pipeline_type
         from public.cases
        where id = $1
        limit 1`,
      [case_id],
    ),
    read_canonical_case_layer_outputs<ChronologyEvent[]>(case_id, "chronology_reconstruction"),
    read_canonical_case_layer_outputs<Entity[]>(case_id, "entity_registry"),
    read_canonical_case_layer_outputs<Relationship[]>(case_id, "relationship_graph"),
    read_canonical_case_layer_outputs<StateTransition[]>(case_id, "state_timeline"),
  ]);

  const case_row = case_result.rows[0];
  const reads = [
    { layer_name: "chronology_reconstruction", ...chronology_read },
    { layer_name: "entity_registry", ...entity_read },
    { layer_name: "relationship_graph", ...relationship_read },
    { layer_name: "state_timeline", ...transition_read },
  ];
  if (!case_row || reads.some(read => read.state !== "canonical_projection")) {
    return {
      contract_version: CASE_PIPELINE_CANDIDATE_CONTRACT_VERSION,
      projection_state: "not_projected",
      selected_pipeline_key: case_row?.pipeline_type ?? null,
      selected_pipeline_source: case_row?.pipeline_type ? "cases.pipeline_type" : null,
      candidate_pipeline_does_not_establish_claim: true,
      facility_wide_context_is_not_case_specific: true,
      source_counts: {
        case_specific_events: 0,
        facility_wide_events: 0,
        relationships: 0,
        case_specific_transitions: 0,
        facility_wide_transitions: 0,
        entities: 0,
      },
      candidates: [],
      source_receipts: receipt_rows(reads),
    };
  }

  const chronology = chronology_read.outputs.flatMap(output => output.data);
  const entities = entity_read.outputs.flatMap(output => output.data);
  const relationships = relationship_read.outputs.flatMap(output => output.data);
  const transitions = transition_read.outputs.flatMap(output => output.data);

  const preliminary = derive_case_pipeline_candidates({
    case_name: case_row.name,
    case_domain: case_row.domain,
    selected_pipeline_key: case_row.pipeline_type,
    chronology,
    entities,
    relationships,
    transitions,
  });

  const pipeline_ids = preliminary.candidates.map(candidate => candidate.pipeline_id);
  const route_result = pipeline_ids.length === 0
    ? { rows: [] as Array<{ situation_key: string; route_count: number | string; access_point_count: number | string }> }
    : await getPool().query<{
        situation_key: string;
        route_count: number | string;
        access_point_count: number | string;
      }>(
        `select situation_key,
                count(*)::int as route_count,
                count(*) filter (
                  where coalesce(filing_or_complaint_url, phone, email, website) is not null
                )::int as access_point_count
           from public.v_lighthouse_reviewed_action_route_current_v1
          where situation_key = any($1::text[])
          group by situation_key`,
        [pipeline_ids],
      );

  const reviewed_routes = new Map(route_result.rows.map(row => [
    row.situation_key,
    { route_count: Number(row.route_count), access_point_count: Number(row.access_point_count) },
  ]));
  const derived = derive_case_pipeline_candidates({
    case_name: case_row.name,
    case_domain: case_row.domain,
    selected_pipeline_key: case_row.pipeline_type,
    chronology,
    entities,
    relationships,
    transitions,
    reviewed_routes,
  });

  return {
    contract_version: CASE_PIPELINE_CANDIDATE_CONTRACT_VERSION,
    projection_state: "canonical_projection",
    selected_pipeline_key: case_row.pipeline_type,
    selected_pipeline_source: case_row.pipeline_type ? "cases.pipeline_type" : null,
    candidate_pipeline_does_not_establish_claim: true,
    facility_wide_context_is_not_case_specific: true,
    source_counts: derived.source_counts,
    candidates: derived.candidates,
    source_receipts: receipt_rows(reads),
  };
}
