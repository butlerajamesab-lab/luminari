import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, verifyCaseOwnership, verifyCaseWriteAccess } = vi.hoisted(() => ({
  query: vi.fn(),
  verifyCaseOwnership: vi.fn(),
  verifyCaseWriteAccess: vi.fn(),
}));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
  verifyCaseOwnership,
  verifyCaseWriteAccess,
}));

import {
  connect_signal_artifact_to_case,
  list_case_signal_artifacts,
  list_signal_artifacts,
  read_signal_artifact,
  read_signal_source_observations,
  signal_artifact_destination,
} from "./signal-artifact-runtime";

describe("Signal Architecture artifact runtime", () => {
  beforeEach(() => {
    query.mockReset();
    verifyCaseOwnership.mockReset();
    verifyCaseWriteAccess.mockReset();
  });

  it("routes canonical artifact kinds to their Lighthouse homes deterministically", () => {
    expect(signal_artifact_destination("legal_pattern", "workflow_gap").home_path)
      .toBe("/diagnostics");
    expect(signal_artifact_destination("legal_pattern", "override_conflict").home_path)
      .toBe("/contradiction-scoring");
    expect(signal_artifact_destination("live_data", "geographic_cluster").home_path)
      .toBe("/viewfinder");
    expect(signal_artifact_destination("convergence", "three_domain_intersection").home_path)
      .toBe("/integrity-review");
  });

  it("paginates the complete canonical public-domain set without exposing intake details", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        domain_code: "live_data",
        record_id: "00000000-0000-4000-8000-000000000001",
        artifact_type: "geographic_cluster",
        title: "Geographic concentration",
        description: "A bounded concentration candidate.",
        jurisdiction_id: "WA",
        status: "supported_one_source",
        severity: "medium",
        confidence_score: "0.81",
        source_reference: "atlas.stream:event",
        source_hash: "a".repeat(64),
        occurred_at: "2026-08-22T00:00:00.000Z",
        created_at: "2026-08-22T00:00:00.000Z",
        engine_id: "atlas",
        engine_version: "2.0.0",
        rule_id: "atlas.domain3.geographic_cluster",
        rule_version: "1.0.0",
        input_hash: "d".repeat(64),
        governance_status: "observation_candidate",
        source_freshness_at: "2026-08-20T00:00:00.000Z",
        total_count: "101",
      }],
    });

    const result = await list_signal_artifacts({ limit: 50, offset: 50 });

    expect(result).toMatchObject({ total: 101, offset: 50, has_more: true, next_offset: 51 });
    expect(result.items[0]).toMatchObject({
      home_label: "Anomaly Viewfinder",
      destination_path: "/viewfinder?signal_domain=live_data&signal_id=00000000-0000-4000-8000-000000000001",
      status: "supported_one_source",
      governance_status: "observation_candidate",
      occurred_at: "2026-08-22T00:00:00.000Z",
      source_freshness_at: "2026-08-20T00:00:00.000Z",
      method: {
        engine_id: "atlas",
        engine_version: "2.0.0",
        rule_id: "atlas.domain3.geographic_cluster",
        rule_version: "1.0.0",
        input_hash: "d".repeat(64),
      },
    });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("public.legal_patterns");
    expect(sql).toContain("public.live_data_signals");
    expect(sql).toContain("public.signal_convergences");
    expect(sql).not.toContain("public.intake_signals");
  });

  it("retains the real total when a page empties after supersession", async () => {
    query.mockResolvedValueOnce({ rows: [{ record_id: null, total_count: "49" }] });
    const result = await list_signal_artifacts({ domain: "live_data", limit: 50, offset: 50 });
    expect(result).toMatchObject({ items: [], total: 49, has_more: false, next_offset: null });
    expect(query.mock.calls[0][1]).toEqual(["live_data", "", 50, 50]);
  });

  it("keeps unavailable method data unknown and binds search as a value", async () => {
    query.mockResolvedValueOnce({ rows: [{
      domain_code: "legal_pattern", record_id: "00000000-0000-4000-8000-000000000002",
      artifact_type: "workflow_gap", title: "Source comparison", description: "Gap candidate",
      jurisdiction_id: null, status: "unresolved", severity: null, confidence_score: null,
      source_reference: null, source_hash: "b".repeat(64), occurred_at: null, created_at: null,
      total_count: "1",
    }] });
    const result = await list_signal_artifacts({ domain: "legal_pattern", limit: 50, offset: 0, query: "  O'Brien  " });
    expect(result.items[0]).toMatchObject({
      occurred_at: null, source_freshness_at: null, governance_status: null,
      method: { engine_id: null, engine_version: null, rule_id: null, rule_version: null, input_hash: null },
    });
    expect(query.mock.calls[0][1]).toEqual(["legal_pattern", "O'Brien", 50, 0]);
    expect(query.mock.calls[0][0]).not.toContain("O'Brien");
    expect(new Date(result.checked_at).getTime()).not.toBeNaN();
  });

  it("returns the full legal evidence and provenance rather than the thin recent view", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        record_id: "00000000-0000-4000-8000-000000000002",
        artifact_type: "override_conflict",
        title: "Verified override conflict",
        description: "Source-bound mismatch.",
        jurisdiction_id: "WA",
        status: "contradicted",
        severity: null,
        confidence_score: null,
        source_reference: "verification:run-1",
        source_hash: "b".repeat(64),
        occurred_at: "2026-08-22T00:00:00.000Z",
        created_at: "2026-08-22T00:00:00.000Z",
        source_relation: "verification",
        source_record_key: "run-1",
        jurisdiction_scope: { state_code: "WA" },
        authority_refs: [{ source_url: "https://example.test/source" }],
        contradiction_refs: [{ source_quote: "exact text" }],
        enforcement_refs: [],
        engine_id: "prism",
        engine_version: "1",
        rule_id: "override",
        rule_version: "1",
        input_hash: "c".repeat(64),
      }],
    });

    const result = await read_signal_artifact(
      "legal_pattern",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(result.home_path).toBe("/contradiction-scoring");
    expect(result.evidence).toMatchObject({
      authority_refs: [{ source_url: "https://example.test/source" }],
      contradiction_refs: [{ source_quote: "exact text" }],
    });
    expect(result.provenance).toMatchObject({ engine_id: "prism", rule_id: "override" });
  });

  it("resolves only saved source identities and keeps bigint offsets lossless", async () => {
    query.mockResolvedValueOnce({ rows: [{
      stream_id: "cfpb_complaints", event_offset: "9223372036854775807",
      event_identity_hash: "a".repeat(64), resolution: "matched",
      observed_at: "2026-05-10T00:28:15.973Z", source_id: "cfpb_complaints", jurisdiction_id: "FL",
      payload: { complaint_id: "22042857", issue: "Improper use of your report" }, spacetime: { region: "FL" },
    }] });
    const result = await read_signal_source_observations([
      { stream_id: "cfpb_complaints", offset: "9223372036854775807", event_identity_hash: "a".repeat(64) },
      { stream_id: "invalid", offset: "9223372036854775808", event_identity_hash: "a".repeat(64) },
      { stream_id: "invalid", offset: 100, event_identity_hash: "missing" },
      { stream_id: "invalid", offset: Number.MAX_SAFE_INTEGER + 1, event_identity_hash: "a".repeat(64) },
    ]);
    expect(result).toMatchObject({ reference_count: 4, invalid_reference_count: 3, truncated: false });
    expect(result.observations[0]).toMatchObject({ event_offset: "9223372036854775807", payload: { complaint_id: "22042857" } });
    expect(JSON.parse(query.mock.calls[0][1][0])).toEqual([
      { stream_id: "cfpb_complaints", event_offset: "9223372036854775807", event_identity_hash: "a".repeat(64) },
    ]);
    expect(query.mock.calls[0][0]).toContain("case when hash_matches then payload - 'provenance_tracking' end");
    expect(query.mock.calls[0][0]).toContain('event.stream_id = ref.stream_id and event."offset" = ref.event_offset');
  });

  it("reports missing references without querying unrelated observations", async () => {
    expect(await read_signal_source_observations(null)).toMatchObject({ reference_count: 0, observations: [] });
    expect(await read_signal_source_observations([null, { offset: "1 OR 1=1" }])).toMatchObject({ invalid_reference_count: 2, observations: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it("bounds source resolution and reports retained references beyond the limit", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await read_signal_source_observations(Array.from({ length: 101 }, (_, offset) => ({ stream_id: "source", offset, event_identity_hash: "a".repeat(64) })));
    expect(result).toMatchObject({ reference_count: 101, truncated: true });
    expect(JSON.parse(query.mock.calls[0][1][0])).toHaveLength(100);
  });

  it("verifies case access before listing connected context receipts", async () => {
    verifyCaseOwnership.mockResolvedValueOnce({ id: 3, _accessLevel: "OWNER" });
    query.mockResolvedValueOnce({
      rows: [{
        link_id: "00000000-0000-4000-8000-000000000004",
        case_id: 3,
        domain_code: "legal_pattern",
        record_id: "00000000-0000-4000-8000-000000000002",
        relationship_type: "contradiction_candidate",
        reviewer_notes: "Review against the case record.",
        title: "Verified override conflict",
        artifact_type: "override_conflict",
        source_hash: "b".repeat(64),
        created_at: "2026-08-22T00:00:00.000Z",
      }],
    });

    const result = await list_case_signal_artifacts({ case_id: 3, user_id: 9 });

    expect(verifyCaseOwnership).toHaveBeenCalledWith(3, 9);
    expect(result[0].destination_path).toContain("/contradiction-scoring?");
    expect(result[0].relationship_type).toBe("contradiction_candidate");
  });

  it("creates a hash-bound case receipt only after write access is verified", async () => {
    verifyCaseWriteAccess.mockResolvedValueOnce({ id: 3, _accessLevel: "OWNER" });
    query
      .mockResolvedValueOnce({
        rows: [{
          record_id: "00000000-0000-4000-8000-000000000002",
          artifact_type: "override_conflict",
          title: "Verified override conflict",
          description: "Source-bound mismatch.",
          jurisdiction_id: "WA",
          status: "contradicted",
          severity: null,
          confidence_score: null,
          source_reference: "verification:run-1",
          source_hash: "b".repeat(64),
          occurred_at: "2026-08-22T00:00:00.000Z",
          created_at: "2026-08-22T00:00:00.000Z",
          source_relation: "verification",
          source_record_key: "run-1",
          jurisdiction_scope: { state_code: "WA" },
          authority_refs: [],
          contradiction_refs: [],
          enforcement_refs: [],
          engine_id: "prism",
          engine_version: "1",
          rule_id: "override",
          rule_version: "1",
          input_hash: "c".repeat(64),
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          link_id: "00000000-0000-4000-8000-000000000004",
          case_id: 3,
          domain_code: "legal_pattern",
          relationship_type: "contradiction_candidate",
        }],
      });

    const result = await connect_signal_artifact_to_case({
      domain: "legal_pattern",
      record_id: "00000000-0000-4000-8000-000000000002",
      case_id: 3,
      relationship_type: "contradiction_candidate",
      reviewer_notes: "Review against the case record.",
      user_id: 9,
    });

    expect(verifyCaseWriteAccess).toHaveBeenCalledWith(3, 9);
    expect(result).toMatchObject({ created: true, case_id: 3 });
    const insertSql = String(query.mock.calls[1][0]);
    const insertValues = query.mock.calls[1][1] as unknown[];
    expect(insertSql).toContain("insert into public.signal_artifact_case_links_v1");
    expect(insertValues[3]).toBe("00000000-0000-4000-8000-000000000002");
    expect(insertValues[11]).toBe("b".repeat(64));
    expect(insertValues[12]).toMatch(/^[0-9a-f]{64}$/);
  });
});
