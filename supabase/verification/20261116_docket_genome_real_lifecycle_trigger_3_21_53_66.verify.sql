-- Disposable Supabase replay acceptance only; NEVER run on production.
-- This script uses the actual migrated lifecycle + registration triggers.
-- All synthetic rows, source metadata, and derived ledger writes are rolled back.
-- Histories mirror the 3/21/53/66 event cardinalities seen in the five-job pilot;
-- they are NOT copies of provider documents and cannot prove performance at scale.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';

do $acceptance$
declare
  v_history_length integer;
  v_source_bill_id integer;
  v_number text;
  v_family_id uuid;
  v_genome_bill_id uuid;
  v_history jsonb;
  v_record jsonb;
  v_actual_events integer;
  v_current_events integer;
  v_revisions integer;
  v_after_events integer;
  v_after_revisions integer;
  v_start timestamptz;
  v_duration_ms numeric;
begin
  if to_regprocedure('public.sync_civic_genome_lifecycle_history_v3(integer)') is null
      or to_regprocedure('public.register_docket_legislative_version_spine(integer,boolean)') is null
      or to_regclass('public.civic_genome_lifecycle_event_v2') is null
      or to_regclass('public.civic_genome_lifecycle_source_revision_v3') is null
      or to_regclass('public.v_civic_genome_lifecycle_event_current_v3') is null then
    raise exception 'real_civic_genome_lifecycle_replay_objects_missing';
  end if;

  if not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.civic_genome_bill'::regclass
         and tgname = 'civic_genome_bill_lifecycle_event_time_v3'
         and tgenabled <> 'D'
     ) or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.civic_genome_bill'::regclass
         and tgname = 'civic_genome_legislative_version_spine_registration'
         and tgenabled <> 'D'
     ) then
    raise exception 'real_civic_genome_bill_triggers_not_enabled';
  end if;

  foreach v_history_length in array array[3, 21, 53, 66] loop
    -- Exact synthetic identities are outside the real bill corpus.
    v_source_bill_id := 1900010000 + v_history_length;
    v_number := format('CI-HB%s', v_history_length);
    select jsonb_agg(
      jsonb_build_object(
        'date', (date '2025-01-01' + i)::text,
        'action', format('Referred to standing committee %s', i),
        'chamber', 'H'
      ) order by i
    ) into v_history
    from generate_series(1, v_history_length) i;

    v_record := jsonb_build_object(
      'bill_id', v_source_bill_id,
      'state', 'TX',
      'session_id', 2160,
      'bill_number', v_number,
      'status', 1,
      'status_date', '2025-01-01',
      'last_action_date', '2025-07-01',
      'history', v_history,
      'texts', '[]'::jsonb,
      'amendments', '[]'::jsonb
    );

    insert into public.civic_genome_family (
      family_key, family_label, policy_domain
    ) values (
      format('ci-20261116-genome-history-%s', v_history_length),
      format('CI lifecycle history %s', v_history_length),
      'government'
    ) returning family_id into v_family_id;

    -- The cache must exist before Genome INSERT, as in the archive pipeline.
    insert into public.docket_bill_detail_cache (
      bill_id, bill, fetched_at, source
    ) values (
      v_source_bill_id, v_record,
      timestamptz '2026-11-14 12:00:00+00', 'legiscan_bulk_json'
    );

    v_start := clock_timestamp();
    insert into public.civic_genome_bill (
      family_id, bill_id, state_code, session_key,
      source_bill_number, source_bill_title,
      structural_dna_hash, structural_dna_json
    ) values (
      v_family_id, gen_random_uuid(), 'TX', '2160',
      v_number, 'Synthetic CI bill for trigger replay',
      repeat('a', 64),
      jsonb_build_object(
        'source_bill_id', v_source_bill_id::text,
        'source_transport', 'legiscan_bulk_json'
      )
    ) returning genome_bill_id into v_genome_bill_id;
    v_duration_ms := round((extract(epoch from clock_timestamp() - v_start) * 1000)::numeric, 1);

    select count(*)::integer into v_actual_events
    from public.civic_genome_lifecycle_event_v2
    where genome_bill_id = v_genome_bill_id
      and event_type <> 'source_tombstone';

    select count(*)::integer into v_current_events
    from public.v_civic_genome_lifecycle_event_current_v3
    where genome_bill_id = v_genome_bill_id;

    select count(*)::integer into v_revisions
    from public.civic_genome_lifecycle_source_revision_v3
    where genome_bill_id = v_genome_bill_id;

    if v_actual_events <> v_history_length
        or v_current_events <> v_history_length
        or v_revisions < 1 then
      raise exception 'lifecycle_replay_count_mismatch history=% events=% current=% revisions=%',
        v_history_length, v_actual_events, v_current_events, v_revisions;
    end if;

    -- Must remain replayable and idempotent with no new immutable events.
    perform public.sync_civic_genome_lifecycle_history_v3(v_source_bill_id);
    select count(*)::integer into v_after_events
    from public.civic_genome_lifecycle_event_v2 where genome_bill_id = v_genome_bill_id;
    select count(*)::integer into v_after_revisions
    from public.civic_genome_lifecycle_source_revision_v3 where genome_bill_id = v_genome_bill_id;
    if v_after_events <> v_actual_events or v_after_revisions <> v_revisions then
      raise exception 'lifecycle_replay_not_idempotent history=% before=(%,%) after=(%,%)',
        v_history_length, v_actual_events, v_revisions, v_after_events, v_after_revisions;
    end if;

    raise notice 'lifecycle_real_trigger_verified history=% events=% current=% revisions=% insert_ms=%',
      v_history_length, v_actual_events, v_current_events, v_revisions, v_duration_ms;
  end loop;
end
$acceptance$;

rollback;
