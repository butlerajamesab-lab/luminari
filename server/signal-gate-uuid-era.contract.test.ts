import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Contract test for the signal-gate UUID-era proposals
 * (supabase/proposals/20261104_signal_gate_uuid_era.proposal.sql and
 * 20261104_signal_promotion_batch.proposal.sql).
 *
 * Production defect these proposals repair (reproduced live against
 * the production database in a rolled-back transaction, 2026-11-04):
 * evaluate_and_promote_signal(uuid, ...) calls
 * process_live_signal_through_gate with a uuid, but the gate exists
 * only in an integer-id form, so every call fails with ERROR 42883
 * (function does not exist) and no bridged candidate is ever
 * gate-evaluated.
 *
 * Harness scope: the proposals' own SQL is executed verbatim
 * (including the real gate scoring body the gate proposal carries).
 * Objects the proposals do not touch are harness doubles:
 * threshold_profiles / resolve_threshold_profile / compute_signal_hash
 * are decision inputs, stubbed with one explicit profile;
 * promote_gate_signal is a contract double for the unchanged
 * production promoter (same signature, same contract: verify a
 * PROMOTE gate row, write promotion log + detected_signals,
 * idempotent). detected_signals / extraction_staging /
 * signal_promotion_log / live_data_signals are column-faithful
 * harness tables. This harness never touches a Supabase project.
 */

const gateProposal = readFileSync(
  new URL(
    "../supabase/proposals/20261104_signal_gate_uuid_era.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);
const batchProposal = readFileSync(
  new URL(
    "../supabase/proposals/20261104_signal_promotion_batch.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);

let database: PGlite;

const CANDIDATE_FRESH = "aa000000-0000-4000-8000-000000000001";
const CANDIDATE_STALE = "aa000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    create type public.gate_decision as enum
      ('PROMOTE','STAGE','HOLD','REJECT','ESCALATE_REVIEW');
    create type public.signal_severity_enum as enum
      ('critical','high','medium','low');

    -- Integer-era gate log, one historical row (id 12345).
    create table public.sunam_gate_log (
      gate_log_id uuid primary key default gen_random_uuid(),
      live_signal_id integer,
      signal_type text, source_system text, source_connector_id text,
      jurisdiction_raw_value text, dataset_id text,
      signal_hash text, payload_hash text, gate_hash text,
      decision_hash text, profile_name text,
      score_source_trust_tier numeric, score_temporal_relevance numeric,
      score_jurisdiction_validity numeric, score_schema_validity numeric,
      score_extraction_completeness numeric,
      score_provenance_confidence numeric,
      score_duplicate_probability numeric,
      score_contradiction_flags numeric,
      composite_score numeric, decision public.gate_decision,
      decision_reason text, score_breakdown jsonb,
      input_snapshot jsonb, escalation_trigger text,
      evaluated_at timestamptz
    );
    insert into public.sunam_gate_log (live_signal_id, signal_type, decision)
      values (12345, 'legacy_signal', 'HOLD');

    create table public.threshold_profiles (
      profile_name text primary key,
      weight_source_trust_tier numeric, weight_temporal_relevance numeric,
      weight_jurisdiction_validity numeric, weight_schema_validity numeric,
      weight_extraction_completeness numeric,
      weight_provenance_confidence numeric,
      weight_duplicate_probability numeric,
      weight_contradiction_flags numeric,
      promote_threshold numeric, stage_threshold numeric,
      hold_threshold numeric,
      escalate_on_zero_provenance boolean,
      escalate_on_unknown_source boolean
    );
    insert into public.threshold_profiles values
      ('harness', 0.15, 0.10, 0.10, 0.10, 0.15, 0.20, 0.10, 0.10,
       0.80, 0.60, 0.40, true, true);

    create function public.resolve_threshold_profile(text, text, text)
    returns public.threshold_profiles
    language sql as $$
      select * from public.threshold_profiles order by profile_name limit 1
    $$;

    create function public.compute_signal_hash(
      text, text, text, text, timestamptz, jsonb)
    returns text
    language sql immutable as $$
      select md5($1 || '|' || $2 || '|' || $3 || '|' || $4 || '|' ||
                 $5::text || '|' || $6::text)
    $$;

    create table public.detected_signals (
      id uuid primary key default gen_random_uuid(),
      signal_type text, jurisdiction_raw_value text,
      source_url text, detected_at timestamptz,
      confidence_score numeric, severity public.signal_severity_enum,
      signal_status text, generation_method text, rule_id text,
      rule_version text, record_origin text, verification_status text,
      evidence_payload jsonb, provenance_metadata jsonb,
      gate_log_id uuid, created_at timestamptz
    );

    create table public.extraction_staging (
      id uuid primary key default gen_random_uuid(),
      gate_log_id uuid, decision public.gate_decision,
      signal_type text, source_system text,
      jurisdiction_raw_value text, confidence_score numeric,
      severity text, staging_reason text, signal_payload jsonb
    );

    create table public.signal_promotion_log (
      promotion_id uuid primary key default gen_random_uuid(),
      gate_log_id uuid, decision_hash text, live_signal_id uuid,
      signal_type text, source_system text,
      jurisdiction_raw_value text, composite_score numeric,
      promotion_status text, detected_signal_id uuid,
      promotion_hash text, promoted_at timestamptz,
      updated_at timestamptz, failure_reason text
    );

    -- Contract double for the unchanged production promoter.
    create function public.promote_gate_signal(
      p_gate_log_id uuid, p_signal_type text, p_source_system text,
      p_source_connector_id text, p_jurisdiction_raw_value text,
      p_confidence_score numeric, p_severity text, p_signal_status text,
      p_detected_at timestamptz, p_source_url text,
      p_generation_method text, p_rule_id text, p_rule_version text,
      p_record_origin text, p_verification_status text,
      p_evidence_payload jsonb, p_provenance_metadata jsonb,
      p_live_signal_id uuid)
    returns jsonb
    language plpgsql as $fn$
    declare
      v_gl public.sunam_gate_log;
      v_existing uuid;
      v_pid uuid;
      v_dsid uuid;
    begin
      select * into v_gl from public.sunam_gate_log
        where gate_log_id = p_gate_log_id;
      if not found then
        raise exception 'Gate log not found: %', p_gate_log_id;
      end if;
      if v_gl.decision <> 'PROMOTE' then
        raise exception 'Cannot promote signal with gate decision %',
          v_gl.decision;
      end if;
      select detected_signal_id into v_existing
        from public.signal_promotion_log
        where gate_log_id = p_gate_log_id
          and promotion_status = 'promoted';
      if found then
        return jsonb_build_object('promotion_id', null,
          'detected_signal_id', v_existing, 'status', 'duplicate');
      end if;
      insert into public.signal_promotion_log (
        gate_log_id, decision_hash, live_signal_id, signal_type,
        source_system, jurisdiction_raw_value, composite_score,
        promotion_status)
      values (p_gate_log_id, v_gl.decision_hash, p_live_signal_id,
        p_signal_type, p_source_system, p_jurisdiction_raw_value,
        v_gl.composite_score, 'pending')
      returning promotion_id into v_pid;
      insert into public.detected_signals (
        signal_type, jurisdiction_raw_value, confidence_score,
        severity, signal_status, detected_at, source_url,
        generation_method, rule_id, rule_version, record_origin,
        verification_status, evidence_payload, provenance_metadata,
        gate_log_id, created_at)
      values (p_signal_type, p_jurisdiction_raw_value,
        p_confidence_score,
        (case when p_severity in ('critical','high','medium','low')
          then p_severity else 'low' end)::public.signal_severity_enum,
        coalesce(p_signal_status, 'active'), coalesce(p_detected_at, now()),
        p_source_url, coalesce(p_generation_method, 'deterministic_rule'),
        p_rule_id, coalesce(p_rule_version, 'v1'),
        coalesce(p_record_origin, 'streaming_investigation'),
        coalesce(p_verification_status, 'verified'),
        coalesce(p_evidence_payload, '{}'::jsonb),
        coalesce(p_provenance_metadata, '{}'::jsonb),
        p_gate_log_id, now())
      returning id into v_dsid;
      update public.signal_promotion_log
        set detected_signal_id = v_dsid, promotion_status = 'promoted',
            promotion_hash = md5(p_gate_log_id::text || '|' || v_dsid::text),
            promoted_at = now(), updated_at = now()
        where promotion_id = v_pid;
      return jsonb_build_object('promotion_id', v_pid,
        'detected_signal_id', v_dsid, 'status', 'promoted',
        'gate_log_id', p_gate_log_id,
        'composite_score', v_gl.composite_score);
    end;
    $fn$;

    create table public.live_data_signals (
      live_data_signal_id uuid primary key,
      signal_type text, title text, description text,
      primary_stream_id text, source_event_refs jsonb,
      entity_ids jsonb, entity_resolution_status text,
      jurisdiction_id text, severity text,
      confidence_score numeric, verification_state text,
      supporting_statistics jsonb, evidence_refs jsonb,
      detection_rule_id text, detection_rule_version text,
      engine_id text, engine_version text, input_hash text,
      signal_hash text, source_freshness_at timestamptz,
      detected_at timestamptz, created_at timestamptz,
      governance_status text, supersedes_id uuid,
      is_current boolean, atlas_candidate_id text,
      atlas_candidate_hash text, atlas_semantic_key text
    );
  `);
});

afterAll(async () => {
  await database?.close();
});

describe("signal gate UUID-era proposals", () => {
  it("converts the gate log id column losslessly and installs the seam", async () => {
    const before = await database.query<{ data_type: string }>(
      `select data_type from information_schema.columns
        where table_schema='public' and table_name='sunam_gate_log'
          and column_name='live_signal_id'`,
    );
    expect(before.rows[0].data_type).toBe("integer");

    await database.exec(gateProposal);

    const after = await database.query<{ data_type: string }>(
      `select data_type from information_schema.columns
        where table_schema='public' and table_name='sunam_gate_log'
          and column_name='live_signal_id'`,
    );
    expect(after.rows[0].data_type).toBe("text");
    const seed = await database.query<{ live_signal_id: string }>(
      `select live_signal_id from public.sunam_gate_log
        where signal_type='legacy_signal'`,
    );
    expect(seed.rows[0].live_signal_id).toBe("12345");
  });

  it("executes the real gate scoring body for a text (uuid-era) id", async () => {
    const result = await database.query<{ r: any }>(
      `select public.process_live_signal_through_gate(
         $1, 'cross_jurisdiction_recurrence', 'cfpb', 'cfpb_complaints',
         'us-wa', 'cfpb_complaints', 0.95, 'critical', now(),
         'https://example.com/source', 'deterministic_rule',
         'atlas_bridge', 'verified', '{"k":1}'::jsonb,
         '{"engine":"harness"}'::jsonb, '{"raw":true}'::jsonb) as r`,
      [`${CANDIDATE_FRESH}`],
    );
    const gate = result.rows[0].r;
    expect(gate.decision).toBe("PROMOTE");
    expect(Number(gate.composite_score)).toBeGreaterThanOrEqual(0.8);
    const logged = await database.query<{ n: number }>(
      `select count(*)::int as n from public.sunam_gate_log
        where live_signal_id = $1`,
      [CANDIDATE_FRESH],
    );
    expect(logged.rows[0].n).toBe(1);
  });

  it("keeps the legacy integer signature resolving through the shim", async () => {
    const result = await database.query<{ r: any }>(
      `select public.process_live_signal_through_gate(
         777, 'legacy_type', 'cfpb', 'cfpb_complaints', 'us-wa',
         'cfpb_complaints', 0.95, 'critical', now(),
         'https://example.com/source', 'deterministic_rule',
         'atlas_bridge', 'verified', '{"k":1}'::jsonb,
         '{"engine":"harness"}'::jsonb, '{"raw":true}'::jsonb) as r`,
    );
    expect(result.rows[0].r.decision).toBe("PROMOTE");
    const logged = await database.query<{ live_signal_id: string }>(
      `select live_signal_id from public.sunam_gate_log
        where signal_type='legacy_type'`,
    );
    expect(logged.rows[0].live_signal_id).toBe("777");
  });

  it("runs the batch caller end to end: candidate -> gate -> promotion", async () => {
    await database.exec(batchProposal);
    await database.query(
      `insert into public.live_data_signals (
         live_data_signal_id, signal_type, title, description,
         primary_stream_id, source_event_refs, entity_ids,
         entity_resolution_status, jurisdiction_id, severity,
         confidence_score, verification_state, supporting_statistics,
         evidence_refs, detection_rule_id, detection_rule_version,
         engine_id, engine_version, input_hash, signal_hash,
         source_freshness_at, detected_at, created_at,
         governance_status, is_current, atlas_candidate_id,
         atlas_candidate_hash, atlas_semantic_key)
       values ($1, 'cross_jurisdiction_recurrence', 't', 'd',
         'cfpb_complaints', '[]'::jsonb, '[]'::jsonb, 'resolved',
         'us-wa', 'critical', 0.95, 'verified', '{"n":19}'::jsonb,
         '[]'::jsonb, 'atlas.domain3.cross_jurisdiction_recurrence',
         '1.0', 'atlas.domain3_population_exact', '1.1.0', 'ih',
         'sh-fresh', now(), now(), now(), 'observation_candidate',
         true, 'cand-1', 'ch-1', 'sem-1')`,
      [CANDIDATE_FRESH],
    );

    const batch = await database.query<{ r: any }>(
      `select public.run_signal_promotion_batch_v1(10, 'cfpb_complaints') as r`,
    );
    const out = batch.rows[0].r;
    expect(out.evaluated).toBe(1);
    expect(out.decisions[0].decision).toBe("PROMOTE");
    expect(out.decisions[0].promotion_status).toBe("promoted");
    const promoted = await database.query<{ n: number }>(
      `select count(*)::int as n from public.detected_signals
        where gate_log_id = $1`,
      [out.decisions[0].gate_log_id],
    );
    expect(promoted.rows[0].n).toBe(1);
  });

  it("is idempotent: a second batch run creates no second promotion", async () => {
    const batch = await database.query<{ r: any }>(
      `select public.run_signal_promotion_batch_v1(10, 'cfpb_complaints') as r`,
    );
    const out = batch.rows[0].r;
    expect(out.evaluated).toBe(1);
    expect(out.decisions[0].promotion_status).toBe("duplicate");
    const detected = await database.query<{ n: number }>(
      `select count(*)::int as n from public.detected_signals`,
    );
    expect(detected.rows[0].n).toBe(1);
  });

  it("routes a weak stale candidate to staging instead of promoting it", async () => {
    await database.query(
      `insert into public.live_data_signals (
         live_data_signal_id, signal_type, title, description,
         primary_stream_id, source_event_refs, entity_ids,
         entity_resolution_status, jurisdiction_id, severity,
         confidence_score, verification_state, supporting_statistics,
         evidence_refs, detection_rule_id, detection_rule_version,
         engine_id, engine_version, input_hash, signal_hash,
         source_freshness_at, detected_at, created_at,
         governance_status, is_current, atlas_candidate_id,
         atlas_candidate_hash, atlas_semantic_key)
       values ($1, 'cross_category_entity', 't', 'd',
         'cfpb_complaints', '[]'::jsonb, '[]'::jsonb, 'unresolved',
         'multi_jurisdiction', 'low', 0.30, 'unresolved',
         '{}'::jsonb, '[]'::jsonb,
         'atlas.domain3.cross_category_entity', '1.0',
         'atlas.domain3_population_exact', '1.1.0', 'ih2',
         'sh-stale', now(), now() - interval '400 days', now(),
         'observation_candidate', true, 'cand-2', 'ch-2', 'sem-2')`,
      [CANDIDATE_STALE],
    );
    const batch = await database.query<{ r: any }>(
      `select public.run_signal_promotion_batch_v1(10, 'cfpb_complaints') as r`,
    );
    const stale = batch.rows[0].r.decisions.find(
      (d: any) => d.live_data_signal_id === CANDIDATE_STALE,
    );
    expect(stale).toBeDefined();
    expect(["STAGE", "HOLD", "ESCALATE_REVIEW"]).toContain(stale.decision);
    const staged = await database.query<{ n: number }>(
      `select count(*)::int as n from public.extraction_staging
        where gate_log_id = $1`,
      [stale.gate_log_id],
    );
    expect(staged.rows[0].n).toBe(1);
  });
});
