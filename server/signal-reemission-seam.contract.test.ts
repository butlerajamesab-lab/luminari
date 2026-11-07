import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Contract test for the re-emission seam proposal
 * (20261107_register_governance_carry_forward) against PRODUCTION's
 * shapes: table DDL is generated from information_schema harvests
 * (live_data_signals 29 cols, transition table 9 cols, production
 * CHECK vocabulary); the house hash / semantic-key functions, the
 * immutability guard, the integrity projector and the receipt
 * wrapper are production's verbatim definitions; the proposal under
 * test executes verbatim. The promoted fixture row is built in the
 * promotion write-back's exact output shape (PR #780's hash
 * construction), because the seam's subject is register's behavior
 * GIVEN a promoted row exists. This harness never touches a
 * Supabase project.
 */

const proposal = readFileSync(
  new URL(
    "../supabase/proposals/20261107_register_governance_carry_forward.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);

const SUPPORT = readFileSync(
  new URL("./signal-reemission-seam.support.sql", import.meta.url),
  "utf8",
);

const DDL = "CREATE TABLE public.live_data_signals (\n  \"live_data_signal_id\" uuid DEFAULT gen_random_uuid() NOT NULL,\n  \"signal_type\" text NOT NULL,\n  \"title\" text NOT NULL,\n  \"description\" text NOT NULL,\n  \"primary_stream_id\" text NOT NULL,\n  \"source_event_refs\" jsonb NOT NULL,\n  \"entity_ids\" text[] DEFAULT ARRAY[]::text[] NOT NULL,\n  \"entity_resolution_status\" text NOT NULL,\n  \"jurisdiction_id\" text NOT NULL,\n  \"severity\" text NOT NULL,\n  \"confidence_score\" numeric NOT NULL,\n  \"verification_state\" text NOT NULL,\n  \"supporting_statistics\" jsonb NOT NULL,\n  \"evidence_refs\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n  \"detection_rule_id\" text NOT NULL,\n  \"detection_rule_version\" text NOT NULL,\n  \"engine_id\" text NOT NULL,\n  \"engine_version\" text NOT NULL,\n  \"input_hash\" text NOT NULL,\n  \"signal_hash\" text NOT NULL,\n  \"source_freshness_at\" timestamptz NOT NULL,\n  \"detected_at\" timestamptz NOT NULL,\n  \"created_at\" timestamptz DEFAULT now() NOT NULL,\n  \"governance_status\" text DEFAULT 'observation_candidate'::text NOT NULL,\n  \"supersedes_id\" uuid,\n  \"is_current\" boolean DEFAULT true NOT NULL,\n  \"atlas_candidate_id\" uuid,\n  \"atlas_candidate_hash\" text,\n  \"atlas_semantic_key\" text\n);\nCREATE UNIQUE INDEX live_data_signals_signal_hash_key ON public.live_data_signals (signal_hash);\nCREATE UNIQUE INDEX live_data_signals_one_current_atlas_semantic_idx ON public.live_data_signals (atlas_semantic_key) WHERE (is_current AND (atlas_semantic_key IS NOT NULL));\nCREATE TABLE public.live_data_signal_semantic_transition_v1 (\n  \"transition_id\" uuid DEFAULT gen_random_uuid() NOT NULL,\n  \"semantic_key\" text NOT NULL,\n  \"previous_live_data_signal_id\" uuid,\n  \"current_live_data_signal_id\" uuid NOT NULL,\n  \"atlas_candidate_id\" uuid,\n  \"atlas_candidate_hash\" text,\n  \"transition_reason\" text NOT NULL,\n  \"transition_hash\" text NOT NULL,\n  \"transitioned_at\" timestamptz DEFAULT now() NOT NULL\n);\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_governance_status_check CHECK ((governance_status = ANY (ARRAY['observation_candidate'::text, 'review_hold'::text, 'promoted'::text, 'rejected'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_signal_hash_check CHECK ((signal_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_input_hash_check CHECK ((input_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_atlas_candidate_hash_check CHECK (((atlas_candidate_hash IS NULL) OR (atlas_candidate_hash ~ '^[0-9a-f]{64}$'::text)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_atlas_semantic_key_check CHECK (((atlas_semantic_key IS NULL) OR (atlas_semantic_key ~ '^[0-9a-f]{64}$'::text)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_confidence_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'informational'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_entity_resolution_status_check CHECK ((entity_resolution_status = ANY (ARRAY['resolved'::text, 'ambiguous'::text, 'unresolved'::text, 'ignored'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_verification_state_check CHECK ((verification_state = ANY (ARRAY['supported_one_source'::text, 'supported_multiple_sources'::text, 'contradicted'::text, 'disputed'::text, 'incomplete'::text, 'unresolved'::text, 'verified'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_evidence_refs_check CHECK ((jsonb_typeof(evidence_refs) = 'array'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_source_event_refs_check CHECK (((jsonb_typeof(source_event_refs) = 'array'::text) AND (jsonb_array_length(source_event_refs) > 0)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_statistics_check CHECK (((jsonb_typeof(supporting_statistics) = 'object'::text) AND (supporting_statistics <> '{}'::jsonb)));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_transition_reason_check CHECK ((transition_reason = ANY (ARRAY['new_version'::text, 'reactivated_version'::text])));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_semantic_key_check CHECK ((semantic_key ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_transition_hash_check CHECK ((transition_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_atlas_candidate_hash_check CHECK (((atlas_candidate_hash IS NULL) OR (atlas_candidate_hash ~ '^[0-9a-f]{64}$'::text)));";

let database: PGlite;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await database.query<T>(sql, params as never[]);
  return result.rows[0];
}

function bridgeRecord(over: Record<string, unknown> = {}) {
  return {
    signal_type: "cross_jurisdiction_recurrence",
    title: "Cross-jurisdiction recurrence: ACME HOLDINGS, INC.",
    description:
      "ACME HOLDINGS, INC. appears in observations across 19 governed jurisdictions. This is a recurrence observation, not a finding of wrongdoing.",
    primary_stream_id: "cfpb_complaints",
    source_event_refs: [
      {
        offset: 1778372879521173,
        stream_id: "cfpb_complaints",
        event_identity_hash:
          "54f85f2771d1973605a376ce85cdf3969c565e01bc63cca07fca59f35759a9d3",
      },
    ],
    entity_ids: [] as string[],
    entity_resolution_status: "unresolved",
    jurisdiction_id: "multi_jurisdiction",
    severity: "critical",
    confidence_score: 0.95,
    verification_state: "unresolved",
    supporting_statistics: {
      streams: ["cfpb_complaints"],
      entity_name: "ACME HOLDINGS, INC.",
      jurisdiction_count: 19,
      pattern_count: 100,
    },
    evidence_refs: [] as unknown[],
    detection_rule_id: "atlas.domain3.cross_jurisdiction_recurrence",
    detection_rule_version: "1.0.0",
    engine_id: "atlas.domain3_population_exact",
    engine_version: "1.1.0",
    source_freshness_at: "2026-11-07T00:00:00Z",
    detected_at: "2026-11-07T01:00:00Z",
    atlas_candidate_id: "11111111-1111-4111-8111-111111111111",
    atlas_candidate_hash: "a".repeat(64),
    ...over,
  };
}

async function register(record: Record<string, unknown>): Promise<string> {
  const row = await one<{ id: string }>(
    "select public.register_live_data_signal_v1($1::jsonb) as id",
    [JSON.stringify(record)],
  );
  return row.id;
}

async function receipt(record: Record<string, unknown>) {
  const row = await one<{ r: { live_data_signal_id: string; governance_status: string } }>(
    "select public.register_live_data_signal_receipt_v1($1::jsonb) as r",
    [JSON.stringify(record)],
  );
  return row.r;
}

async function rowOf(id: string) {
  return one<{
    governance_status: string;
    is_current: boolean;
    atlas_semantic_key: string;
    signal_hash: string;
  }>(
    "select governance_status, is_current, atlas_semantic_key, signal_hash from public.live_data_signals where live_data_signal_id = $1",
    [id],
  );
}

async function currentsForKey(key: string): Promise<string[]> {
  const result = await database.query<{ live_data_signal_id: string }>(
    "select live_data_signal_id from public.live_data_signals where atlas_semantic_key = $1 and is_current",
    [key],
  );
  return result.rows.map((r) => r.live_data_signal_id);
}

async function transitionCount(key: string): Promise<number> {
  const row = await one<{ n: string }>(
    "select count(*) as n from public.live_data_signal_semantic_transition_v1 where semantic_key = $1",
    [key],
  );
  return Number(row.n);
}

/** Build the promoted row for a candidate in the write-back's exact
 *  output shape (PR #780): the candidate copied in full, governance
 *  'promoted', input_hash over the copied record, signal_hash the
 *  house projection hash extended with governance_status. */
async function makePromoted(candidateId: string): Promise<string> {
  const cand = await one<{ j: Record<string, unknown> }>(
    "select to_jsonb(t) as j from public.live_data_signals t where live_data_signal_id = $1",
    [candidateId],
  );
  const j = cand.j;
  const rec: Record<string, unknown> = { ...j };
  for (const k of ["live_data_signal_id", "created_at", "is_current", "supersedes_id", "signal_hash", "input_hash"]) {
    delete rec[k];
  }
  rec.governance_status = "promoted";
  const inputHash = await one<{ h: string }>(
    "select public.signal_architecture_hash_v1($1::jsonb) as h",
    [JSON.stringify(rec)],
  );
  const signalHash = await one<{ h: string }>(
    "select public.signal_architecture_hash_v1($1::jsonb) as h",
    [
      JSON.stringify({
        projection_contract: "atlas_domain3_candidate_projection_v2",
        atlas_candidate_hash: j.atlas_candidate_hash,
        atlas_semantic_key: j.atlas_semantic_key,
        detection_rule_id: j.detection_rule_id,
        detection_rule_version: j.detection_rule_version,
        engine_id: j.engine_id,
        engine_version: j.engine_version,
        governance_status: "promoted",
      }),
    ],
  );
  const promotedId = randomUUID();
  const full = {
    ...rec,
    live_data_signal_id: promotedId,
    input_hash: inputHash.h,
    signal_hash: signalHash.h,
    supersedes_id: candidateId,
    is_current: true,
    created_at: new Date().toISOString(),
  };
  await database.query(
    "update public.live_data_signals set is_current = false where live_data_signal_id = $1",
    [candidateId],
  );
  await database.query(
    "insert into public.live_data_signals select * from jsonb_populate_record(null::public.live_data_signals, $1::jsonb)",
    [JSON.stringify(full)],
  );
  return promotedId;
}

beforeAll(async () => {
  database = new PGlite({ extensions: { pgcrypto } });
  await database.exec("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions; CREATE SCHEMA private;");
  await database.exec(DDL);
  await database.exec(SUPPORT);
  await database.exec(proposal);
}, 120_000);

afterAll(async () => {
  await database?.close();
});

describe("re-emission seam: governance carry-forward (production shapes)", () => {
  let candidateId = "";
  let promotedId = "";
  let key = "";
  const recordA = bridgeRecord();

  it("registers a fresh bridged candidate as a current observation candidate", async () => {
    candidateId = await register(recordA);
    const row = await rowOf(candidateId);
    expect(row.governance_status).toBe("observation_candidate");
    expect(row.is_current).toBe(true);
    expect(row.atlas_semantic_key).toMatch(/^[0-9a-f]{64}$/);
    key = row.atlas_semantic_key;
  });

  it("identical re-emission after promotion reactivates the PROMOTED row, not the candidate", async () => {
    promotedId = await makePromoted(candidateId);
    expect((await rowOf(promotedId)).governance_status).toBe("promoted");
    expect((await rowOf(promotedId)).is_current).toBe(true);
    expect((await rowOf(candidateId)).is_current).toBe(false);

    // Recreate the 2026-11-07 production state: a bridge cycle has
    // flipped the candidate back to current and the promoted row off.
    await database.query("update public.live_data_signals set is_current = false where live_data_signal_id = $1", [promotedId]);
    await database.query("update public.live_data_signals set is_current = true where live_data_signal_id = $1", [candidateId]);

    const before = await transitionCount(key);
    const r = await receipt(recordA);
    expect(r.live_data_signal_id).toBe(promotedId);
    expect(r.governance_status).toBe("promoted");
    expect(await currentsForKey(key)).toEqual([promotedId]);
    expect(await transitionCount(key)).toBe(before + 1);
    const t = await one(
      "select previous_live_data_signal_id, current_live_data_signal_id, transition_reason from public.live_data_signal_semantic_transition_v1 where semantic_key = $1 order by transitioned_at desc limit 1",
      [key],
    );
    expect(t?.previous_live_data_signal_id).toBe(candidateId);
    expect(t?.current_live_data_signal_id).toBe(promotedId);
    expect(t?.transition_reason).toBe("reactivated_version");
  });

  it("a second identical re-emission is a no-op: promoted stays current, no new transition", async () => {
    const before = await transitionCount(key);
    const r = await receipt(recordA);
    expect(r.live_data_signal_id).toBe(promotedId);
    expect(await currentsForKey(key)).toEqual([promotedId]);
    expect(await transitionCount(key)).toBe(before);
  });

  it("a re-derived candidate (new candidate identity) lands as a PROMOTED current version", async () => {
    const recordB = bridgeRecord({
      atlas_candidate_id: "22222222-2222-4222-8222-222222222222",
      atlas_candidate_hash: "b".repeat(64),
      supporting_statistics: {
        streams: ["cfpb_complaints"],
        entity_name: "ACME HOLDINGS, INC.",
        jurisdiction_count: 19,
        pattern_count: 130,
      },
      source_freshness_at: "2026-11-07T06:00:00Z",
      detected_at: "2026-11-07T07:00:00Z",
    });
    const newId = await register(recordB);
    expect(newId).not.toBe(candidateId);
    expect(newId).not.toBe(promotedId);
    const row = await rowOf(newId);
    expect(row.governance_status).toBe("promoted");
    expect(row.is_current).toBe(true);
    expect((await rowOf(promotedId)).is_current).toBe(false);
    expect(await currentsForKey(key)).toEqual([newId]);

    // And re-emitting that same new version returns it unchanged.
    const again = await register(recordB);
    expect(again).toBe(newId);
    expect(await currentsForKey(key)).toEqual([newId]);
  });

  it("a never-promoted key never gains governance from re-emission", async () => {
    const recordC = bridgeRecord({
      title: "Cross-jurisdiction recurrence: OTHER CORP",
      atlas_candidate_id: "33333333-3333-4333-8333-333333333333",
      atlas_candidate_hash: "c".repeat(64),
      supporting_statistics: {
        streams: ["cfpb_complaints"],
        entity_name: "OTHER CORP",
        jurisdiction_count: 3,
        pattern_count: 10,
      },
    });
    const c2 = await register(recordC);
    expect((await rowOf(c2)).governance_status).toBe("observation_candidate");
    expect(await register(recordC)).toBe(c2);
    const recordD = bridgeRecord({
      title: "Cross-jurisdiction recurrence: OTHER CORP",
      atlas_candidate_id: "44444444-4444-4444-8444-444444444444",
      atlas_candidate_hash: "d".repeat(64),
      supporting_statistics: {
        streams: ["cfpb_complaints"],
        entity_name: "OTHER CORP",
        jurisdiction_count: 3,
        pattern_count: 12,
      },
      detected_at: "2026-11-07T08:00:00Z",
    });
    const n2 = await register(recordD);
    expect(n2).not.toBe(c2);
    expect((await rowOf(n2)).governance_status).toBe("observation_candidate");
    expect((await rowOf(n2)).is_current).toBe(true);
    expect((await rowOf(c2)).is_current).toBe(false);
  });

  it("the immutability guard still forbids editing governance onto a row", async () => {
    await expect(
      database.query(
        "update public.live_data_signals set governance_status = 'promoted' where live_data_signal_id = $1",
        [candidateId],
      ),
    ).rejects.toThrow(/immutable/);
  });
});
