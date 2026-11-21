import { describe, expect, it } from "vitest";
import {
  alertKey,
  isAwaitingReview,
  planGovernedCandidateAlerts,
  subscriptionMatchesCandidate,
  type GovernedCandidate,
  type ReviewAlertSubscription,
} from "./governed-candidate-alerts";

/**
 * Gate B Kernel 1 — deterministic core of governed candidate alerting.
 *
 * The kernel's whole policy: a new governed candidate awaiting review
 * (public.live_data_signals, is_current, governance_status =
 * 'observation_candidate') produces exactly one alert delivery per
 * matching active subscription — never twice, and never for any other
 * governance state. These tests pin that policy to the pure planning
 * function; no database is touched.
 */

function candidate(overrides: Partial<GovernedCandidate> = {}): GovernedCandidate {
  return {
    signalId: "sig-1",
    signalHash: "a".repeat(64),
    title: "Candidate One",
    streamId: "stream-a",
    jurisdictionId: "jurisdiction-1",
    severity: "high",
    governanceStatus: "observation_candidate",
    isCurrent: true,
    detectedAt: 1_000,
    ...overrides,
  };
}

function subscription(overrides: Partial<ReviewAlertSubscription> = {}): ReviewAlertSubscription {
  return {
    id: 1,
    userId: "reviewer-1",
    streamId: null,
    jurisdictionId: null,
    channel: "in_app",
    isPaused: false,
    ...overrides,
  };
}

describe("isAwaitingReview", () => {
  it("accepts only current observation candidates", () => {
    expect(isAwaitingReview(candidate())).toBe(true);
    expect(isAwaitingReview(candidate({ governanceStatus: "promoted" }))).toBe(false);
    expect(isAwaitingReview(candidate({ governanceStatus: "rejected" }))).toBe(false);
    expect(isAwaitingReview(candidate({ governanceStatus: "review_hold" }))).toBe(false);
    expect(isAwaitingReview(candidate({ isCurrent: false }))).toBe(false);
  });
});

describe("subscriptionMatchesCandidate", () => {
  it("matches all when both filters are null", () => {
    expect(subscriptionMatchesCandidate(subscription(), candidate())).toBe(true);
  });

  it("applies stream and jurisdiction filters exactly", () => {
    expect(
      subscriptionMatchesCandidate(subscription({ streamId: "stream-a" }), candidate()),
    ).toBe(true);
    expect(
      subscriptionMatchesCandidate(subscription({ streamId: "stream-b" }), candidate()),
    ).toBe(false);
    expect(
      subscriptionMatchesCandidate(
        subscription({ jurisdictionId: "jurisdiction-1" }),
        candidate(),
      ),
    ).toBe(true);
    expect(
      subscriptionMatchesCandidate(
        subscription({ jurisdictionId: "jurisdiction-2" }),
        candidate(),
      ),
    ).toBe(false);
  });
});

describe("planGovernedCandidateAlerts", () => {
  it("plans one delivery for a new candidate awaiting review", () => {
    const planned = planGovernedCandidateAlerts({
      candidates: [candidate()],
      subscriptions: [subscription()],
      existingAlertKeys: [],
    });
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      alertKey: alertKey(1, "sig-1"),
      subscriptionId: 1,
      userId: "reviewer-1",
      channel: "in_app",
      signalId: "sig-1",
      streamId: "stream-a",
    });
  });

  it("never re-alerts an already-delivered (subscription, candidate) pair", () => {
    const planned = planGovernedCandidateAlerts({
      candidates: [candidate()],
      subscriptions: [subscription()],
      existingAlertKeys: [alertKey(1, "sig-1")],
    });
    expect(planned).toHaveLength(0);
  });

  it("is idempotent: a second pass after recording the first plans nothing", () => {
    const first = planGovernedCandidateAlerts({
      candidates: [candidate(), candidate({ signalId: "sig-2", detectedAt: 2_000 })],
      subscriptions: [subscription()],
      existingAlertKeys: [],
    });
    expect(first).toHaveLength(2);
    const second = planGovernedCandidateAlerts({
      candidates: [candidate(), candidate({ signalId: "sig-2", detectedAt: 2_000 })],
      subscriptions: [subscription()],
      existingAlertKeys: first.map((p) => p.alertKey),
    });
    expect(second).toHaveLength(0);
  });

  it("alerts nothing for non-governed states", () => {
    for (const governanceStatus of ["promoted", "rejected", "review_hold"]) {
      const planned = planGovernedCandidateAlerts({
        candidates: [candidate({ governanceStatus })],
        subscriptions: [subscription()],
        existingAlertKeys: [],
      });
      expect(planned, governanceStatus).toHaveLength(0);
    }
    const superseded = planGovernedCandidateAlerts({
      candidates: [candidate({ isCurrent: false })],
      subscriptions: [subscription()],
      existingAlertKeys: [],
    });
    expect(superseded).toHaveLength(0);
  });

  it("skips paused subscriptions and non-matching filters", () => {
    expect(
      planGovernedCandidateAlerts({
        candidates: [candidate()],
        subscriptions: [subscription({ isPaused: true })],
        existingAlertKeys: [],
      }),
    ).toHaveLength(0);
    expect(
      planGovernedCandidateAlerts({
        candidates: [candidate()],
        subscriptions: [subscription({ streamId: "other-stream" })],
        existingAlertKeys: [],
      }),
    ).toHaveLength(0);
  });

  it("fans out deterministically: subscriptions by id, candidates by (detectedAt, signalId)", () => {
    const planned = planGovernedCandidateAlerts({
      candidates: [
        candidate({ signalId: "sig-b", detectedAt: 2_000 }),
        candidate({ signalId: "sig-a", detectedAt: 2_000 }),
        candidate({ signalId: "sig-c", detectedAt: 500 }),
      ],
      subscriptions: [subscription({ id: 7 }), subscription({ id: 3 })],
      existingAlertKeys: [],
    });
    expect(planned.map((p) => p.alertKey)).toEqual([
      alertKey(3, "sig-c"),
      alertKey(3, "sig-a"),
      alertKey(3, "sig-b"),
      alertKey(7, "sig-c"),
      alertKey(7, "sig-a"),
      alertKey(7, "sig-b"),
    ]);
    // Same inputs, same plan — byte for byte.
    const again = planGovernedCandidateAlerts({
      candidates: [
        candidate({ signalId: "sig-b", detectedAt: 2_000 }),
        candidate({ signalId: "sig-a", detectedAt: 2_000 }),
        candidate({ signalId: "sig-c", detectedAt: 500 }),
      ],
      subscriptions: [subscription({ id: 7 }), subscription({ id: 3 })],
      existingAlertKeys: [],
    });
    expect(again).toEqual(planned);
  });

  it("deduplicates repeated candidate rows within one pass", () => {
    const planned = planGovernedCandidateAlerts({
      candidates: [candidate(), candidate()],
      subscriptions: [subscription()],
      existingAlertKeys: [],
    });
    expect(planned).toHaveLength(1);
  });
});
