import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate B Kernel 2 — publication I/O, against an in-memory fake of
 * ../db at the same seam K1's alerting I/O tests use (vi.mock of the
 * db module), with writeGovernanceLog stubbed to record its inputs.
 * No database is touched. The fake transaction stages publication
 * writes and discards them on throw — the atomicity property the
 * kernel depends on: no published-but-unlogged state can exist.
 */

const PROMOTED_ID = "f886164b-7a5c-40c4-9a54-3f6fd56381f2";
const SECOND_ID = "4293e373-4c9d-46c8-8c3b-529530fd161a";
const CANDIDATE_ID = "cc7edc84-2618-46d7-9504-ffd2f8c1d57a";
const HASH = "a".repeat(64);
const ACTOR = "admin-open-id";
const RATIONALE = "Reviewed the underlying records and the pattern holds";

interface FakeStore {
  signals: any[];
  publications: any[];
  nextPublicationId: number;
  logCalls: any[];
  failLogWith: unknown;
}

const harness = vi.hoisted((): FakeStore => ({
  signals: [],
  publications: [],
  nextPublicationId: 1,
  logCalls: [],
  failLogWith: null,
}));

function sqlToText(query: any): { text: string; params: any[] } {
  const chunks: any[] = query?.queryChunks ?? [];
  let text = "";
  const params: any[] = [];
  for (const chunk of chunks) {
    if (chunk && Array.isArray(chunk.value)) {
      text += chunk.value.join("");
    } else if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
      const nested = sqlToText(chunk);
      text += nested.text;
      params.push(...nested.params);
    } else if (chunk && typeof chunk === "object" && "value" in chunk) {
      params.push(chunk.value);
      text += `$${params.length}`;
    } else {
      params.push(chunk);
      text += `$${params.length}`;
    }
  }
  return { text: text.replace(/\s+/g, " "), params };
}

function canonicalQuery(params: any[]): any[] {
  let rows = harness.signals.filter(
    (r) => r.is_current === true && r.governance_status !== "rejected",
  );
  const idsParam = params.find((p) => Array.isArray(p));
  if (idsParam) {
    rows = rows.filter((r) => idsParam.includes(r.live_data_signal_id));
  }
  const status = params.find(
    (p) =>
      typeof p === "string" &&
      ["observation_candidate", "review_hold", "promoted"].includes(p),
  );
  if (status) rows = rows.filter((r) => r.governance_status === status);
  rows = [...rows].sort(
    (a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at),
  );
  const numbers = params.filter((p) => typeof p === "number");
  if (numbers.length >= 2) {
    const [limit, offset] = numbers.slice(-2);
    rows = rows.slice(offset, offset + limit);
  }
  return rows;
}

vi.mock("../db", () => {
  function executeOn(
    staging: { publications: any[]; nextPublicationId: number },
    query: any,
  ): { rows: any[] } {
    const { text, params } = sqlToText(query);
    if (text.includes("from public.live_data_signals")) {
      const row = harness.signals.find(
        (r) => r.live_data_signal_id === params[0],
      );
      return { rows: row ? [row] : [] };
    }
    if (text.includes("insert into public.signal_publications")) {
      const row = {
        id: staging.nextPublicationId++,
        live_data_signal_id: params[0],
        signal_hash: params[1],
        published_at: params[2],
        published_by: params[3],
        unpublished_at: null,
        governance_seq_no: null,
      };
      staging.publications.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (text.includes("update public.signal_publications")) {
      const id = params[params.length - 1];
      const row = staging.publications.find((r) => r.id === id);
      if (row) {
        if (text.includes("unpublished_at =")) row.unpublished_at = params[0];
        if (text.includes("governance_seq_no =")) row.governance_seq_no = params[0];
      }
      return { rows: [] };
    }
    if (text.includes("select id from public.signal_publications")) {
      return {
        rows: staging.publications.filter(
          (r) => r.live_data_signal_id === params[0] && r.unpublished_at == null,
        ),
      };
    }
    if (text.includes("from public.signal_publications")) {
      return {
        rows: staging.publications
          .filter(
            (r) => r.live_data_signal_id === params[0] && r.unpublished_at == null,
          )
          .sort((a, b) => b.id - a.id),
      };
    }
    throw new Error(`fake tx.execute: unhandled SQL: ${text}`);
  }

  return {
    pool: {
      query: async (text: string, params: any[] = []) => {
        if (text.includes("from public.live_data_signals")) {
          return { rows: canonicalQuery(params) };
        }
        if (text.includes("from public.signal_publications")) {
          if (Array.isArray(params[0])) {
            const ids = params[0] as string[];
            return {
              rows: harness.publications.filter((r) =>
                ids.includes(r.live_data_signal_id),
              ),
            };
          }
          // Active-publications listing (publications first, limit last):
          // params are [limit, offset]; return active rows in id order.
          const numbers = params.filter((p) => typeof p === "number");
          const [limit, offset] =
            numbers.length >= 2 ? numbers.slice(-2) : [numbers[0] ?? 1000, 0];
          const active = harness.publications
            .filter((r) => r.unpublished_at == null)
            .sort((a, b) => a.id - b.id);
          return { rows: active.slice(offset, offset + limit) };
        }
        throw new Error(`fake pool.query: unhandled SQL: ${text}`);
      },
    },
    db: {
      transaction: async (cb: (tx: any) => Promise<unknown>) => {
        const staging = {
          publications: harness.publications.map((r) => ({ ...r })),
          nextPublicationId: harness.nextPublicationId,
        };
        const tx = { execute: (q: any) => executeOn(staging, q) };
        const result = await cb(tx);
        harness.publications = staging.publications;
        harness.nextPublicationId = staging.nextPublicationId;
        return result;
      },
    },
  };
});

vi.mock("../governance-log", () => ({
  writeGovernanceLog: async (_tx: unknown, input: unknown) => {
    if (harness.failLogWith) {
      const err = harness.failLogWith;
      harness.failLogWith = null;
      throw err;
    }
    harness.logCalls.push(input);
    return { seqNo: 100 + harness.logCalls.length, entryHash: "e".repeat(64) };
  },
}));

import {
  getPublishedSignal,
  listPromotedSignals,
  listPublishedSignals,
  publishSignal,
  unpublishSignal,
} from "./signal-publication";

function signalRow(overrides: Record<string, unknown> = {}): any {
  return {
    live_data_signal_id: PROMOTED_ID,
    signal_type: "cross_jurisdiction_recurrence",
    title: "Cross-jurisdiction recurrence: EXAMPLE CORP",
    description:
      "EXAMPLE CORP appears in 100 observations across 5 governed jurisdictions. This is a recurrence observation, not a finding of wrongdoing.",
    primary_stream_id: "cfpb_complaints",
    source_event_refs: [],
    entity_ids: [],
    entity_resolution_status: "unresolved",
    jurisdiction_id: "multi_jurisdiction",
    severity: "high",
    confidence_score: 0.95,
    verification_state: "supported_multiple_sources",
    // Attribution-free by default (no entity_ids, no entity_name in the
    // statistics): the default promoted signal is public-safe. Tests
    // that need entity attribution add it explicitly.
    supporting_statistics: {},
    evidence_refs: [],
    detection_rule_id: "atlas.domain3.cross_jurisdiction_recurrence",
    detection_rule_version: "1.0.0",
    engine_id: "atlas.domain3_population_exact",
    engine_version: "1.1.0",
    input_hash: "f".repeat(64),
    signal_hash: HASH,
    source_freshness_at: "2026-11-05T04:59:23.000Z",
    detected_at: "2026-11-05T11:00:49.808Z",
    governance_status: "promoted",
    is_current: true,
    ...overrides,
  };
}

beforeEach(() => {
  harness.signals = [
    signalRow(),
    signalRow({
      live_data_signal_id: SECOND_ID,
      signal_hash: "c".repeat(64),
      title: "Second promoted signal",
    }),
    signalRow({
      live_data_signal_id: CANDIDATE_ID,
      signal_hash: "d".repeat(64),
      title: "Unreviewed candidate",
      governance_status: "observation_candidate",
    }),
  ];
  harness.publications = [];
  harness.nextPublicationId = 1;
  harness.logCalls = [];
  harness.failLogWith = null;
});

describe("publishSignal", () => {
  it("publishes a promoted signal and logs the act in the same transaction", async () => {
    const result = await publishSignal({
      signalId: PROMOTED_ID,
      rationale: RATIONALE,
      actorId: ACTOR,
    });
    expect(result.publicationId).toBe(1);
    expect(result.governanceSeqNo).toBe(101);
    expect(harness.publications).toHaveLength(1);
    const row = harness.publications[0];
    expect(row.live_data_signal_id).toBe(PROMOTED_ID);
    expect(row.signal_hash).toBe(HASH);
    expect(row.unpublished_at).toBeNull();
    expect(row.governance_seq_no).toBe(101);
    expect(row.published_by).toBe(
      createHash("sha256").update(ACTOR).digest("hex"),
    );
    expect(harness.logCalls).toHaveLength(1);
    expect(harness.logCalls[0]).toMatchObject({
      eventType: "signal_published",
      component: "signal_publication",
      scope: `signal_id:${PROMOTED_ID}`,
      actorRole: "admin",
      actorId: ACTOR,
      rationale: RATIONALE,
    });
  });

  it("refuses to publish a candidate — the gate's acceptance comes first", async () => {
    await expect(
      publishSignal({ signalId: CANDIDATE_ID, rationale: RATIONALE, actorId: ACTOR }),
    ).rejects.toThrow(/not a current promoted signal/);
    expect(harness.publications).toHaveLength(0);
    expect(harness.logCalls).toHaveLength(0);
  });

  it("refuses a second active publication of the same signal", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    await expect(
      publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR }),
    ).rejects.toThrow(/already published/);
    expect(harness.publications).toHaveLength(1);
  });

  it("rolls the publication back when the governance log write fails", async () => {
    harness.failLogWith = new Error("Governance rationale must be at least 10 characters");
    await expect(
      publishSignal({ signalId: PROMOTED_ID, rationale: "short", actorId: ACTOR }),
    ).rejects.toThrow(/rationale/);
    expect(harness.publications).toHaveLength(0);
  });
});

describe("unpublishSignal", () => {
  it("withdraws the publication and logs the withdrawal", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    const result = await unpublishSignal({
      signalId: PROMOTED_ID,
      rationale: "Withdrawing pending a correction to the underlying records",
      actorId: ACTOR,
    });
    expect(result.publicationId).toBe(1);
    expect(harness.publications[0].unpublished_at).not.toBeNull();
    expect(harness.publications[0].governance_seq_no).toBe(102);
    expect(harness.logCalls[1]).toMatchObject({
      eventType: "signal_unpublished",
      component: "signal_publication",
      scope: `signal_id:${PROMOTED_ID}`,
    });
    await expect(listPublishedSignals()).resolves.toEqual([]);
  });

  it("refuses to unpublish a signal with no active publication", async () => {
    await expect(
      unpublishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR }),
    ).rejects.toThrow(/no active publication/);
  });

  it("allows re-publishing after an unpublish, as a new act", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    await unpublishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    const again = await publishSignal({
      signalId: PROMOTED_ID,
      rationale: RATIONALE,
      actorId: ACTOR,
    });
    expect(again.publicationId).toBe(2);
    expect(harness.publications).toHaveLength(2);
    const published = await listPublishedSignals();
    expect(published.map((e) => e.signalId)).toEqual([PROMOTED_ID]);
  });
});

describe("public reads", () => {
  it("serve only promoted + published signals; a candidate id returns nothing", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    const list = await listPublishedSignals();
    expect(list.map((e) => e.signalId)).toEqual([PROMOTED_ID]);
    expect(list[0].title).toContain("EXAMPLE CORP");
    // The candidate is not promoted, not published, and not public.
    await expect(getPublishedSignal(CANDIDATE_ID)).resolves.toBeNull();
    // Promoted but never published is not public either.
    await expect(getPublishedSignal(SECOND_ID)).resolves.toBeNull();
    const detail = await getPublishedSignal(PROMOTED_ID);
    expect(detail?.signalHash).toBe(HASH);
    // Unresolved entity: the working name in the statistics never leaks.
    expect(detail && "entityName" in detail).toBe(false);
  });

  it("a demoted signal leaves the public surface on its own", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    await expect(listPublishedSignals()).resolves.toHaveLength(1);
    const row = harness.signals.find((r) => r.live_data_signal_id === PROMOTED_ID);
    row.governance_status = "observation_candidate";
    await expect(listPublishedSignals()).resolves.toEqual([]);
    await expect(getPublishedSignal(PROMOTED_ID)).resolves.toBeNull();
  });
});

describe("listPromotedSignals (gate read)", () => {
  it("shows promoted signals only, with publication state", async () => {
    await publishSignal({ signalId: PROMOTED_ID, rationale: RATIONALE, actorId: ACTOR });
    const list = await listPromotedSignals();
    const byId = new Map(list.map((item) => [item.signal.signalId, item]));
    expect(byId.get(PROMOTED_ID)?.publication.state).toBe("published");
    expect(byId.get(SECOND_ID)?.publication.state).toBe("never_published");
    expect(byId.has(CANDIDATE_ID)).toBe(false);
    // The gate sees the why-it-is-a-signal detail.
    expect(byId.get(PROMOTED_ID)?.signal.detectionRuleId).toContain("cross_jurisdiction_recurrence");
  });
});

const UNSAFE_STATS_ID = "7b8c9d2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e";
const UNSAFE_IDS_ID = "8c9d0e3f-4a5b-4c6d-9e7f-0a1b2c3d4e5f";
const RESOLVED_ID = "9d0e1f40-5b6c-4d7e-af80-1b2c3d4e5f60";

describe("publishSignal — public-safety refusal (Codex Finding 1)", () => {
  it("refuses a promoted signal whose unresolved entity name rides in the statistics and the prose", async () => {
    // The K2 fixture pattern, verbatim: the working entity name is in
    // supporting_statistics AND embedded in the title/description
    // prose (the recurrence format). Resolution is unresolved, so
    // publishing would put that name on the public surface.
    harness.signals.push(
      signalRow({
        live_data_signal_id: UNSAFE_STATS_ID,
        signal_hash: "e".repeat(64),
        supporting_statistics: { entity_name: "EXAMPLE CORP" },
        entity_resolution_status: "unresolved",
      }),
    );
    const err = await publishSignal({
      signalId: UNSAFE_STATS_ID,
      rationale: RATIONALE,
      actorId: ACTOR,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("entity attribution unresolved");
    expect((err as any).code).toBe("SIGNAL_NOT_PUBLIC_SAFE");
    // Nothing was written and nothing was logged.
    expect(harness.publications).toHaveLength(0);
    expect(harness.logCalls).toHaveLength(0);
    // And it never reaches the public surface.
    await expect(listPublishedSignals()).resolves.toEqual([]);
    await expect(getPublishedSignal(UNSAFE_STATS_ID)).resolves.toBeNull();
  });

  it("refuses a promoted signal carrying entity ids with unresolved attribution", async () => {
    harness.signals.push(
      signalRow({
        live_data_signal_id: UNSAFE_IDS_ID,
        signal_hash: "1".repeat(64),
        entity_ids: ["3f6d8f2e-9a4b-4c1d-b2e3-5a6b7c8d9e0f"],
        supporting_statistics: {},
        entity_resolution_status: "unresolved",
      }),
    );
    const err = await publishSignal({
      signalId: UNSAFE_IDS_ID,
      rationale: RATIONALE,
      actorId: ACTOR,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("entity attribution unresolved");
    expect((err as any).code).toBe("SIGNAL_NOT_PUBLIC_SAFE");
    expect(harness.publications).toHaveLength(0);
    expect(harness.logCalls).toHaveLength(0);
  });

  it("publishes a resolved-attribution signal and renders its entity name", async () => {
    harness.signals.push(
      signalRow({
        live_data_signal_id: RESOLVED_ID,
        signal_hash: "2".repeat(64),
        supporting_statistics: { entity_name: "EXAMPLE CORP" },
        entity_resolution_status: "resolved",
      }),
    );
    await publishSignal({ signalId: RESOLVED_ID, rationale: RATIONALE, actorId: ACTOR });
    const detail = await getPublishedSignal(RESOLVED_ID);
    expect(detail).not.toBeNull();
    expect(detail?.entityName).toBe("EXAMPLE CORP");
    const list = await listPublishedSignals();
    expect(list.map((e) => e.signalId)).toContain(RESOLVED_ID);
  });

  it("marks unsafe promoted signals in the gate list with the reason", async () => {
    harness.signals.push(
      signalRow({
        live_data_signal_id: UNSAFE_STATS_ID,
        signal_hash: "e".repeat(64),
        supporting_statistics: { entity_name: "EXAMPLE CORP" },
        entity_resolution_status: "unresolved",
      }),
    );
    const list = await listPromotedSignals();
    const byId = new Map(list.map((item) => [item.signal.signalId, item]));
    const unsafe = byId.get(UNSAFE_STATS_ID);
    expect(unsafe?.publicSafe).toBe(false);
    expect(unsafe?.publicSafeReason).toBe("entity attribution unresolved");
    const safe = byId.get(PROMOTED_ID);
    expect(safe?.publicSafe).toBe(true);
    expect(safe?.publicSafeReason).toBeNull();
  });
});

describe("pagination — publications first, no filter-before-limit starvation (Codex Finding 2)", () => {
  const TOTAL = 1005;
  const OLDEST_ID = "00000000-0000-4000-8000-000000000000";

  function mintId(i: number): string {
    return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  }

  beforeEach(() => {
    // 1,005 promoted signals, strictly increasing detected_at; the
    // published one is the OLDEST — outside the newest 1,000.
    harness.signals = Array.from({ length: TOTAL }, (_, i) =>
      signalRow({
        live_data_signal_id: mintId(i),
        signal_hash: String(i).padStart(64, "0"),
        title: `Promoted signal ${i}`,
        detected_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      }),
    );
  });

  it("the public list still returns a published signal older than the newest 1,000 promoted", async () => {
    await publishSignal({ signalId: OLDEST_ID, rationale: RATIONALE, actorId: ACTOR });
    const list = await listPublishedSignals();
    expect(list.map((e) => e.signalId)).toEqual([OLDEST_ID]);
  });

  it("getPublishedSignal finds the oldest published signal directly by id", async () => {
    await publishSignal({ signalId: OLDEST_ID, rationale: RATIONALE, actorId: ACTOR });
    const detail = await getPublishedSignal(OLDEST_ID);
    expect(detail).not.toBeNull();
    expect(detail?.signalId).toBe(OLDEST_ID);
  });

  it("the gate's promoted list pages past the first 1,000", async () => {
    const list = await listPromotedSignals();
    expect(list).toHaveLength(TOTAL);
    expect(list.map((item) => item.signal.signalId)).toContain(OLDEST_ID);
  });
});
