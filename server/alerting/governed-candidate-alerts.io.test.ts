import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate B Kernel 1 — evaluation-pass I/O regressions (Codex P2 findings
 * on PR #870). The pure planner is pinned by
 * governed-candidate-alerts.test.ts; this file pins the I/O shell —
 * candidate fetching, the event + delivery-log write pair, and
 * duplicate handling — against an in-memory fake of ../db at the same
 * seam other server tests use (vi.mock of the db module). No database
 * is touched.
 *
 * Finding 1 — pagination starvation: the pass fetched only the newest
 *   1,000 awaiting-review candidates; once those were alerted, every
 *   later pass re-fetched the same 1,000 and planned nothing, so older
 *   candidates were never reached.
 * Finding 2 — non-atomic writes: the alert event committed before the
 *   delivery-log insert; a delivery failure left the candidate marked
 *   alerted with no delivery record, and reruns never repaired it.
 * Finding 3 — duplicate detection read the wrong error layer: the
 *   node-postgres Drizzle adapter wraps PG errors in DrizzleQueryError
 *   with the 23505 code on `cause`, so a concurrent duplicate aborted
 *   the whole pass instead of being counted and skipped.
 */

interface FakeStore {
  candidateRows: any[];
  subscriptions: any[];
  events: any[];
  deliveries: any[];
  nextId: number;
  failNextEventWith: unknown;
  failNextDeliveryWith: unknown;
}

const harness = vi.hoisted((): FakeStore => ({
  candidateRows: [],
  subscriptions: [],
  events: [],
  deliveries: [],
  nextId: 1,
  failNextEventWith: null,
  failNextDeliveryWith: null,
}));

vi.mock("../db", async () => {
  const { getTableName } = await import("drizzle-orm");

  function applyInsert(
    tableName: string,
    values: Record<string, unknown>,
    staging: Record<string, any[]> | null,
  ): any {
    if (tableName === "alert_events" && harness.failNextEventWith) {
      const err = harness.failNextEventWith;
      harness.failNextEventWith = null;
      throw err;
    }
    if (tableName === "alert_delivery_log" && harness.failNextDeliveryWith) {
      const err = harness.failNextDeliveryWith;
      harness.failNextDeliveryWith = null;
      throw err;
    }
    const row = { id: harness.nextId++, ...values };
    if (staging) {
      (staging[tableName] ??= []).push(row);
    } else if (tableName === "alert_events") {
      harness.events.push(row);
    } else if (tableName === "alert_delivery_log") {
      harness.deliveries.push(row);
    }
    return row;
  }

  function makeInsert(tableName: string, staging: Record<string, any[]> | null) {
    return {
      values(values: Record<string, unknown>) {
        let promise: Promise<any> | null = null;
        const run = () =>
          (promise ??= Promise.resolve().then(() =>
            applyInsert(tableName, values, staging),
          ));
        return {
          returning: async () => {
            const row = await run();
            return [{ id: row.id }];
          },
          then: (onFulfilled: any, onRejected: any) =>
            run().then(onFulfilled, onRejected),
        };
      },
    };
  }

  function selectRows(tableName: string): any[] {
    if (tableName === "alert_subscriptions") return harness.subscriptions;
    if (tableName === "alert_events") {
      // loadExistingAlertKeys selects { subscriptionId, metadata }.
      return harness.events.map((e) => ({
        subscriptionId: e.subscriptionId,
        metadata: e.metadata,
      }));
    }
    return [];
  }

  function makeSelect() {
    let tableName = "";
    const chain: any = {
      from(table: unknown) {
        tableName = getTableName(table as any);
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(onFulfilled: any, onRejected: any) {
        return Promise.resolve(selectRows(tableName)).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return chain;
  }

  const db = {
    select: () => makeSelect(),
    insert: (table: unknown) => makeInsert(getTableName(table as any), null),
    delete: () => ({ where: async () => {} }),
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const staging: Record<string, any[]> = {
        alert_events: [],
        alert_delivery_log: [],
      };
      const tx = {
        insert: (table: unknown) =>
          makeInsert(getTableName(table as any), staging),
      };
      // Rollback semantics: staged rows reach the store only when the
      // callback resolves; a throw discards them.
      const result = await callback(tx);
      harness.events.push(...staging.alert_events);
      harness.deliveries.push(...staging.alert_delivery_log);
      return result;
    },
  };

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("count(*)")) {
        return { rows: [{ cnt: harness.candidateRows.length }] };
      }
      const limit = Number(params[1]);
      const offset = Number(params[2] ?? 0);
      const sorted = [...harness.candidateRows].sort((a, b) => {
        const byTime =
          new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
        if (byTime !== 0) return byTime;
        return a.live_data_signal_id < b.live_data_signal_id ? 1 : -1;
      });
      return { rows: sorted.slice(offset, offset + limit) };
    },
  };

  return { db, pool };
});

import { runGovernedCandidateAlerting } from "./governed-candidate-alerts";

function signalRow(index: number) {
  const id = `sig-${String(index).padStart(4, "0")}`;
  return {
    live_data_signal_id: id,
    signal_hash: `hash-${id}`,
    title: `Candidate ${id}`,
    primary_stream_id: "stream-a",
    jurisdiction_id: "jurisdiction-1",
    severity: "high",
    governance_status: "observation_candidate",
    is_current: true,
    detected_at: new Date(index * 1000).toISOString(),
  };
}

function subscriptionRow() {
  return {
    id: 1,
    userId: "reviewer-1",
    subscriptionType: "governed_candidate",
    targetScope: null,
    targetId: null,
    jurisdiction: null,
    industry: null,
    claimType: null,
    riskThreshold: "high",
    alertFrequency: "immediate",
    isPaused: 0,
    notificationChannels: ["in_app"],
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  harness.candidateRows = [];
  harness.subscriptions = [subscriptionRow()];
  harness.events = [];
  harness.deliveries = [];
  harness.nextId = 1;
  harness.failNextEventWith = null;
  harness.failNextDeliveryWith = null;
});

describe("runGovernedCandidateAlerting — PR #870 Codex P2 regressions", () => {
  it("finding 1: reaches candidates older than the newest already-alerted page", async () => {
    // 1,005 awaiting-review candidates; the newest 1,000 (sig-0006 …
    // sig-1005) already alerted for the one subscription. Only the
    // five oldest remain — beyond the old single-page fetch.
    harness.candidateRows = Array.from({ length: 1005 }, (_, i) =>
      signalRow(i + 1),
    );
    for (let i = 6; i <= 1005; i++) {
      harness.events.push({
        id: harness.nextId++,
        subscriptionId: 1,
        alertType: "governed_candidate",
        metadata: { signalId: `sig-${String(i).padStart(4, "0")}` },
      });
    }

    const result = await runGovernedCandidateAlerting(5_000);

    expect(result.candidatesAwaitingReview).toBe(1005);
    expect(result.planned).toBe(5);
    expect(result.delivered).toBe(5);
    const deliveredSignalIds = harness.deliveries
      .map((d) => harness.events.find((e) => e.id === d.alertId))
      .map((e) => e?.metadata?.signalId)
      .sort();
    expect(deliveredSignalIds).toEqual([
      "sig-0001",
      "sig-0002",
      "sig-0003",
      "sig-0004",
      "sig-0005",
    ]);
  });

  it("finding 2: a delivery-log failure commits no event, and a rerun delivers", async () => {
    harness.candidateRows = [signalRow(1)];
    harness.failNextDeliveryWith = new Error("delivery log write failed");

    await expect(runGovernedCandidateAlerting(5_000)).rejects.toThrow(
      "delivery log write failed",
    );
    // The event must have rolled back with the failed delivery write —
    // otherwise the candidate is permanently "alerted" with no record.
    expect(harness.events).toHaveLength(0);
    expect(harness.deliveries).toHaveLength(0);

    const retry = await runGovernedCandidateAlerting(6_000);
    expect(retry.delivered).toBe(1);
    expect(harness.events).toHaveLength(1);
    expect(harness.deliveries).toHaveLength(1);
  });

  it("finding 3: a DrizzleQueryError-wrapped 23505 is a skipped duplicate, and later alerts still deliver", async () => {
    harness.candidateRows = [signalRow(1), signalRow(2)];
    const pgError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "idx_ae_governed_candidate_unique"',
      ),
      { code: "23505", constraint: "idx_ae_governed_candidate_unique" },
    );
    // The shape the node-postgres adapter actually throws: the PG error
    // is on `cause`; the wrapper's own message carries neither the code
    // nor the constraint name.
    harness.failNextEventWith = Object.assign(
      new Error('Failed query: insert into "alert_events" (...) values (...)'),
      { name: "DrizzleQueryError", cause: pgError },
    );

    const result = await runGovernedCandidateAlerting(5_000);

    expect(result.planned).toBe(2);
    expect(result.skippedDuplicates).toBe(1);
    expect(result.delivered).toBe(1);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0].metadata?.signalId).toBe("sig-0002");
    expect(harness.deliveries).toHaveLength(1);
  });
});
