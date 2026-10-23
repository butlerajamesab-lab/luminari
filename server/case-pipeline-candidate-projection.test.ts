import { describe, expect, it } from "vitest";
import { derive_case_pipeline_candidates } from "./case-pipeline-candidate-projection";
import type { ChronologyEvent } from "./engines/intake-spine/layer-4-chronology_reconstruction";
import type { Entity } from "./engines/intake-spine/layer-6-entity_registry";
import type { Relationship } from "./engines/intake-spine/layer-7-relationship_graph";
import type { StateTransition } from "./engines/intake-spine/layer-9-state_timeline";

describe("case pipeline candidate continuity", () => {
  it("uses case-specific sealed evidence for routing candidates without treating facility-wide context as case fact", () => {
    const chronology: ChronologyEvent[] = [
      {
        event_id: "evt_case",
        date: "2026-01-01",
        date_precision: "exact",
        event_text: "Rick lives at a nursing home and fell from his wheelchair after not being cared for.",
        actor: null,
        source_artifact_key: "sha256:case",
        source_span_offset: 10,
        verification_status: "document_stated",
        event_scope: "case_specific",
      },
      {
        event_id: "evt_facility",
        date: "2026-01-02",
        date_precision: "exact",
        event_text: "Police excessive force was mentioned in an unrelated facility-wide example.",
        actor: null,
        source_artifact_key: "sha256:survey",
        source_span_offset: 20,
        verification_status: "document_stated",
        event_scope: "facility_wide",
      },
    ];
    const entities: Entity[] = [{
      entity_id: "ent_rick",
      type: "person",
      canonical_name: "Rick",
      raw_mentions: [{
        raw_text: "Rick",
        artifact_key: "sha256:case",
        span_offset: 0,
        source_context: "Rick is a resident receiving care at the facility.",
      }],
      review_candidates: [],
    }];
    const relationships: Relationship[] = [{
      relationship_id: "rel_care",
      entity_a_id: "ent_cheryl",
      entity_b_id: "ent_rick",
      type: "caregiver_recipient",
      direction: "a_to_b",
      role_a: "caregiver",
      role_b: "care_recipient",
      source_refs: [{
        artifact_key: "sha256:case",
        span_start_offset: 30,
        span_text: "Cheryl is Rick's caregiver.",
        marker_text: "caregiver",
        marker_offset: 12,
      }],
    }];
    const transitions: StateTransition[] = [{
      transition_id: "tr_care",
      entity_id: "ent_rick",
      from_state: null,
      to_state: "care_deficit_documented",
      transition_date: "2026-01-01",
      source_artifact_key: "sha256:case",
      source_span_offset: 40,
      source_text: "Rick was not getting the fluids and care he needed.",
      verification_status: "document_stated",
      transition_scope: "case_specific",
    }];

    const reviewed = new Map([
      ["nursing_home_abuse", { route_count: 6, access_point_count: 6 }],
    ]);
    const projection = derive_case_pipeline_candidates({
      case_name: "Care case",
      case_domain: "elder care",
      selected_pipeline_key: null,
      chronology,
      entities,
      relationships,
      transitions,
      reviewed_routes: reviewed,
      max_candidates: 10,
    });

    expect(projection.source_counts.case_specific_events).toBe(1);
    expect(projection.source_counts.facility_wide_events).toBe(1);
    const nursing = projection.candidates.find(candidate => candidate.pipeline_id === "nursing_home_abuse");
    expect(nursing).toBeDefined();
    expect(nursing?.candidate_state).toBe("candidate_unverified");
    expect(nursing?.basis_state).toBe("case_source_match");
    expect(nursing?.reviewed_route_count).toBe(6);
    expect(nursing?.reviewed_pipeline_intelligence_state).toBe("reviewed_pipeline_intelligence_available");
    expect(nursing?.evidence_refs.some(ref => ref.source_id === "evt_case")).toBe(true);
    expect(nursing?.evidence_refs.some(ref => ref.source_id === "evt_facility")).toBe(false);
    expect(projection.candidates.some(candidate => candidate.pipeline_id === "police_misconduct")).toBe(false);
  });
});
