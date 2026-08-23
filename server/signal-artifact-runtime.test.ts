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
        total_count: "101",
      }],
    });

    const result = await list_signal_artifacts({ limit: 50, offset: 50 });

    expect(result).toMatchObject({ total: 101, offset: 50, has_more: true, next_offset: 51 });
    expect(result.items[0]).toMatchObject({
      home_label: "Anomaly Viewfinder",
      destination_path: "/viewfinder?signal_domain=live_data&signal_id=00000000-0000-4000-8000-000000000001",
    });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("public.legal_patterns");
    expect(sql).toContain("public.live_data_signals");
    expect(sql).toContain("public.signal_convergences");
    expect(sql).not.toContain("public.intake_signals");
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
