import { describe, expect, it } from "vitest";
import {
  activePublicationFor,
  buildPromotedAdminList,
  isPublishable,
  isPubliclyVisible,
  projectPublicExplainer,
  selectPublicExplainers,
  type GovernedSignalRecord,
  type PublicationRecord,
} from "./signal-publication";

/**
 * Gate B Kernel 2 — the publication selection rule, pinned to the
 * pure core. The whole rule: a signal is public exactly when it has
 * an ACTIVE publication AND is still a current promoted row. Every
 * other state — candidate, review_hold, rejected, non-current,
 * unpublished, demoted — is not public, and the public projection is
 * a fixed field whitelist with entity names only when resolved.
 */

const SIGNAL_ID = "f886164b-7a5c-40c4-9a54-3f6fd56381f2";
const HASH = "a".repeat(64);

function record(overrides: Partial<GovernedSignalRecord> = {}): GovernedSignalRecord {
  return {
    signalId: SIGNAL_ID,
    signalHash: HASH,
    title: "Cross-jurisdiction recurrence: EXAMPLE CORP",
    explanation:
      "EXAMPLE CORP appears in 100 observations across 5 governed jurisdictions. This is a recurrence observation, not a finding of wrongdoing.",
    jurisdiction: "multi_jurisdiction",
    category: "cross_jurisdiction_recurrence",
    streamId: "cfpb_complaints",
    severity: "high",
    verificationState: "supported_multiple_sources",
    detectedAt: 1_700_000_000_000,
    governanceStatus: "promoted",
    isCurrent: true,
    entityResolutionStatus: "unresolved",
    entityName: "EXAMPLE CORP",
    detectionRuleId: "atlas.domain3.cross_jurisdiction_recurrence",
    detectionRuleVersion: "1.0.0",
    engineId: "atlas.domain3_population_exact",
    engineVersion: "1.1.0",
    confidenceScore: 0.95,
    ...overrides,
  };
}

function publication(overrides: Partial<PublicationRecord> = {}): PublicationRecord {
  return {
    id: 1,
    liveDataSignalId: SIGNAL_ID,
    signalHash: HASH,
    publishedAt: 1_700_000_100_000,
    publishedBy: "b".repeat(64),
    unpublishedAt: null,
    governanceSeqNo: 11,
    ...overrides,
  };
}

describe("isPublishable", () => {
  it("accepts only current promoted rows", () => {
    expect(isPublishable(record())).toBe(true);
    expect(isPublishable(record({ governanceStatus: "observation_candidate" }))).toBe(false);
    expect(isPublishable(record({ governanceStatus: "review_hold" }))).toBe(false);
    expect(isPublishable(record({ governanceStatus: "rejected" }))).toBe(false);
    expect(isPublishable(record({ isCurrent: false }))).toBe(false);
  });
});

describe("projectPublicExplainer — selection", () => {
  it("projects a promoted, actively published signal", () => {
    const explainer = projectPublicExplainer(record(), [publication()]);
    expect(explainer).not.toBeNull();
    expect(explainer?.title).toBe(record().title);
    expect(explainer?.explanation).toBe(record().explanation);
    expect(explainer?.publishedAt).toBe(1_700_000_100_000);
  });

  it.each([
    ["observation_candidate"],
    ["review_hold"],
    ["rejected"],
  ])("never projects a %s row, even with an active publication", (status) => {
    expect(
      projectPublicExplainer(record({ governanceStatus: status }), [publication()]),
    ).toBeNull();
  });

  it("never projects a non-current (superseded) promoted row", () => {
    expect(projectPublicExplainer(record({ isCurrent: false }), [publication()])).toBeNull();
  });

  it("never projects a promoted row with no publication", () => {
    expect(projectPublicExplainer(record(), [])).toBeNull();
  });

  it("unpublish removes the signal from the public surface", () => {
    const withdrawn = publication({ unpublishedAt: 1_700_000_200_000 });
    expect(projectPublicExplainer(record(), [withdrawn])).toBeNull();
    expect(isPubliclyVisible(record(), [withdrawn])).toBe(false);
  });

  it("demotion removes the signal from the public surface", () => {
    const demoted = record({ governanceStatus: "observation_candidate" });
    expect(isPubliclyVisible(demoted, [publication()])).toBe(false);
    expect(selectPublicExplainers([demoted], [publication()])).toEqual([]);
  });
});

describe("projectPublicExplainer — field whitelist", () => {
  it("carries exactly the whitelisted fields, nothing else", () => {
    const explainer = projectPublicExplainer(record(), [publication()]);
    expect(Object.keys(explainer ?? {}).sort()).toEqual(
      [
        "category",
        "detectedAt",
        "explanation",
        "jurisdiction",
        "publishedAt",
        "severity",
        "signalHash",
        "signalId",
        "stream",
        "title",
        "verificationState",
      ].sort(),
    );
  });

  it("includes the entity name only when resolution is resolved", () => {
    const resolved = projectPublicExplainer(
      record({ entityResolutionStatus: "resolved" }),
      [publication()],
    );
    expect(resolved?.entityName).toBe("EXAMPLE CORP");

    const unresolved = projectPublicExplainer(
      record({ entityResolutionStatus: "unresolved", entityName: "WORKING NAME" }),
      [publication()],
    );
    expect(unresolved).not.toBeNull();
    expect("entityName" in (unresolved ?? {})).toBe(false);

    const resolvedNoName = projectPublicExplainer(
      record({ entityResolutionStatus: "resolved", entityName: null }),
      [publication()],
    );
    expect("entityName" in (resolvedNoName ?? {})).toBe(false);
  });
});

describe("selectPublicExplainers", () => {
  it("returns only visible explainers, newest publication first", () => {
    const other = record({
      signalId: "4293e373-4c9d-46c8-8c3b-529530fd161a",
      signalHash: "c".repeat(64),
      title: "Second signal",
    });
    const otherPub = publication({
      id: 2,
      liveDataSignalId: other.signalId,
      signalHash: other.signalHash,
      publishedAt: 1_700_000_300_000,
    });
    const candidate = record({
      signalId: "cc7edc84-2618-46d7-9504-ffd2f8c1d57a",
      governanceStatus: "observation_candidate",
    });
    const out = selectPublicExplainers(
      [record(), other, candidate],
      [publication(), otherPub],
    );
    expect(out.map((e) => e.signalId)).toEqual([other.signalId, SIGNAL_ID]);
  });
});

describe("buildPromotedAdminList", () => {
  it("lists only promoted rows, with truthful publication states", () => {
    const unpublished = record({
      signalId: "4293e373-4c9d-46c8-8c3b-529530fd161a",
      signalHash: "c".repeat(64),
    });
    const withdrawnPub = publication({
      id: 2,
      liveDataSignalId: unpublished.signalId,
      signalHash: unpublished.signalHash,
      unpublishedAt: 1_700_000_200_000,
    });
    const fresh = record({
      signalId: "cc7edc84-2618-46d7-9504-ffd2f8c1d57a",
      signalHash: "d".repeat(64),
    });
    const candidate = record({
      signalId: "46327716-e7b8-412d-bcd1-e650214d4945",
      governanceStatus: "review_hold",
    });
    const list = buildPromotedAdminList(
      [record(), unpublished, fresh, candidate],
      [publication(), withdrawnPub],
    );
    const byId = new Map(list.map((item) => [item.signal.signalId, item.publication.state]));
    expect(byId.get(SIGNAL_ID)).toBe("published");
    expect(byId.get(unpublished.signalId)).toBe("unpublished");
    expect(byId.get(fresh.signalId)).toBe("never_published");
    expect(byId.has(candidate.signalId)).toBe(false);
  });

  it("an active publication wins over an older withdrawn one", () => {
    const withdrawn = publication({ id: 1, unpublishedAt: 1_700_000_050_000 });
    const active = publication({ id: 2 });
    expect(activePublicationFor([withdrawn, active], SIGNAL_ID)?.id).toBe(2);
    const list = buildPromotedAdminList([record()], [withdrawn, active]);
    expect(list[0].publication.state).toBe("published");
    expect(list[0].publication.publicationId).toBe(2);
  });
});
