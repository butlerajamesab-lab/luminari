import { describe, expect, it } from "vitest";
import {
  attach_integrity_review_evidence,
  create_integrity_escalation_draft,
  record_integrity_corroboration,
  sync_atlas_integrity_candidates,
  type integrity_query,
} from "./integrity-routing-service";

describe("Atlas integrity review routing service", () => {
  it("reconciles through the Atlas projection RPC instead of running a Lighthouse detector", async () => {
    const calls: string[] = [];
    const query: integrity_query = async text => {
      calls.push(text);
      return {
        rows: [{ receipt: { projected_count: 2, candidate_ids: ["candidate-1", "candidate-2"], limit: 100 } }] as never[],
        rowCount: 1,
      };
    };
    const result = await sync_atlas_integrity_candidates(100, query);
    expect(result.projected_count).toBe(2);
    expect(calls[0]).toContain("project_atlas_integrity_candidates_v1");
    expect(calls[0]).not.toMatch(/detect|derive/i);
  });

  it("stores reviewer-bound evidence with an explicit provenance actor", async () => {
    let payload: Record<string, unknown> | null = null;
    const query: integrity_query = async (_text, values = []) => {
      payload = JSON.parse(String(values[0])) as Record<string, unknown>;
      return { rows: [{ evidence_link_id: "evidence-1" }] as never[], rowCount: 1 };
    };
    const id = await attach_integrity_review_evidence({
      candidate_id: "candidate-1",
      source_class: "official_primary",
      source_relation: "fec.gov",
      source_record_key: "MUR-1",
      source_uri: "https://www.fec.gov/",
      pinpoint: "page 1",
      source_content_hash: "a".repeat(64),
      supports_or_contradicts: "supports",
      created_by_id: "admin-1",
      query,
    });
    expect(id).toBe("evidence-1");
    expect(payload).toMatchObject({ provenance_type: "reviewer", created_by_id: "admin-1" });
  });

  it("derives corroboration counts from selected database evidence", async () => {
    const payloads: Record<string, unknown>[] = [];
    const query: integrity_query = async (text, values = []) => {
      if (text.includes("integrity_evidence_metrics")) throw new Error("label is not embedded in SQL");
      if (text.includes("count(distinct e.source_relation)")) {
        return {
          rows: [{
            selected_count: 2,
            independent_source_count: 2,
            contradiction_count: 0,
            source_class_count: 2,
            rule_id: "atlas.domain3.integrity.financial_conduit",
            rule_version: "1.0.0",
            atlas_is_current: true,
          }] as never[],
          rowCount: 1,
        };
      }
      payloads.push(JSON.parse(String(values[0])) as Record<string, unknown>);
      return { rows: [{ assessment_id: "assessment-1" }] as never[], rowCount: 1 };
    };
    const id = await record_integrity_corroboration({
      candidate_id: "candidate-1",
      assessment_state: "verified_for_routing",
      rationale: "Two independent official sources agree.",
      evidence_link_ids: ["evidence-2", "evidence-1"],
      assessed_by_id: "admin-1",
      query,
    });
    expect(id).toBe("assessment-1");
    expect(payloads[0]).toMatchObject({
      independent_source_count: 2,
      source_class_count: 2,
      assessed_by_id: "admin-1",
    });
  });

  it("rejects routing verification when selected evidence has a contradiction", async () => {
    const query: integrity_query = async text => {
      if (text.includes("count(distinct e.source_relation)")) {
        return {
          rows: [{
            selected_count: 2,
            independent_source_count: 2,
            contradiction_count: 1,
            source_class_count: 2,
            rule_id: "atlas.domain3.integrity.source_contradiction",
            rule_version: "1.0.0",
            atlas_is_current: true,
          }] as never[],
          rowCount: 1,
        };
      }
      throw new Error("unexpected_query");
    };
    await expect(record_integrity_corroboration({
      candidate_id: "candidate-1",
      assessment_state: "verified_for_routing",
      rationale: "This rationale cannot override the contradiction.",
      evidence_link_ids: ["evidence-1", "evidence-2"],
      assessed_by_id: "admin-1",
      query,
    })).rejects.toThrow("routing_verification_cannot_ignore_contradictions");
  });

  it("creates only an immutable, non-transmittable draft packet", async () => {
    const payloads: Record<string, unknown>[] = [];
    const query: integrity_query = async (text, values = []) => {
      if (text.includes("assessment_state = 'verified_for_routing'")) {
        return { rows: [{ verified: true }] as never[], rowCount: 1 };
      }
      if (text.includes("integrity_candidate_review_v2")) {
        return {
          rows: [{
            candidate_id: "candidate-1",
            case_id: null,
            signal_id: "signal-1",
            candidate_type: "legislative_integrity_anomaly",
            jurisdiction_id: "WA",
            summary: "Review candidate",
            status: "escalation_ready",
            candidate_hash: "a".repeat(64),
            observed_at: null,
            created_at: new Date(),
            evidence_count: 2,
            support_count: 2,
            contradiction_count: 0,
            latest_assessment_state: "verified_for_routing",
            atlas_is_current: true,
            atlas_governance_status: "observation_candidate",
            atlas_verification_state: "unverified",
            atlas_candidate_id: "atlas-candidate-1",
            atlas_candidate_hash: "b".repeat(64),
            atlas_semantic_key: "c".repeat(64),
            atlas_confidence_score: 0.8,
            atlas_severity: "medium",
          }] as never[],
          rowCount: 1,
        };
      }
      if (text.includes("count(distinct e.source_relation)")) {
        return {
          rows: [{
            selected_count: 2,
            independent_source_count: 2,
            contradiction_count: 0,
            source_class_count: 2,
            rule_id: "atlas.domain3.integrity.legislative_financial_convergence",
            rule_version: "1.0.0",
            atlas_is_current: true,
          }] as never[],
          rowCount: 1,
        };
      }
      payloads.push(JSON.parse(String(values[0])) as Record<string, unknown>);
      return { rows: [{ packet_id: "packet-1" }] as never[], rowCount: 1 };
    };
    const result = await create_integrity_escalation_draft({
      candidate_id: "candidate-1",
      assessment_id: "assessment-1",
      evidence_link_ids: ["evidence-1", "evidence-2"],
      route_id: "wa_legislative_ethics_board",
      reviewer_notes: "Reviewed against two independent source classes.",
      created_by_id: "admin-1",
      query,
    });
    expect(result.transmission_authorized).toBe(false);
    expect(payloads[0]).toMatchObject({
      packet_payload: {
        source_system: "Atlas Domain 3",
        transmission_authorized: false,
        human_review_required: true,
      },
    });
  });
});
