-- Migration release: the Docket source-history reader now scopes by the canonical
-- SHA-256 bill UUID; preserve every prior 3/21/53/66 assertion but use the same
-- deterministic synthetic identity that production emits, never gen_random_uuid().
-- Disposable Supabase replay acceptance only; NEVER run on production.
-- This script uses the actual migrated lifecycle triggers and drains the durable
-- detail-derived-work outbox through its production claim/process/complete RPCs.
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
  v_document_count integer;
  v_observation_count integer;
  v_version_count integer;
  v_version_queue_count integer;
  v_first_original_event_id uuid;
  v_correction_event_id uuid;
  v_original_bill_id uuid;
  v_after_bill_id uuid;
  v_corrected_record jsonb;
  v_empty_record jsonb;
  v_effective_at timestamptz;
  v_current_state text;
  v_tombstone_count integer;
  v_work_id uuid;
  v_work_source_bill_id integer;
  v_work_fetched_at timestamptz;
  v_work_receipt jsonb;
  v_work_completed boolean;
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
     ) or not (
       exists (
         select 1 from pg_trigger
         where tgrelid = 'public.civic_genome_bill'::regclass
           and tgname = 'civic_genome_legislative_version_spine_registration'
           and tgenabled <> 'D'
       ) or (
         exists (
           select 1 from pg_trigger
           where tgrelid = 'public.civic_genome_bill'::regclass
             and tgname = 'civic_genome_legislative_version_spine_registration_insert'
             and tgenabled <> 'D'
         )
         and exists (
           select 1 from pg_trigger trigger_row
           where trigger_row.tgrelid = 'public.civic_genome_bill'::regclass
             and trigger_row.tgname = 'civic_genome_legislative_version_spine_registration_update'
             and trigger_row.tgenabled <> 'D'
             and pg_get_triggerdef(trigger_row.oid)
               ilike '%old.structural_dna_json%IS DISTINCT FROM%new.structural_dna_json%'
         )
       )
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
      -- Real trigger must create text + amendment source observations, never
      -- only run a no-op with two empty document arrays.
      'texts', jsonb_build_array(jsonb_build_object(
        'doc_id', v_source_bill_id::bigint + 100000,
        'type', 'Introduced',
        'state_link', format('https://example.invalid/ci/%s/text/introduced', v_source_bill_id),
        'url', format('https://legiscan.com/TX/text/%s/id/%s', v_number, v_source_bill_id::bigint + 100000),
        'date', '2025-01-01'
      )),
      'amendments', jsonb_build_array(jsonb_build_object(
        'amendment_id', v_source_bill_id::bigint + 200000,
        'title', 'Committee amendment 1',
        'chamber', 'H',
        'state_link', format('https://example.invalid/ci/%s/amendment/1', v_source_bill_id),
        'url', format('https://legiscan.com/TX/amendment/%s/id/%s', v_number, v_source_bill_id::bigint + 200000),
        'date', '2025-03-30',
        'adopted', 0
      ))
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
      v_family_id, (
         select (
           substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'
           ||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)
           ||substr(h,18,3)||'-'||substr(h,21,12)
         )::uuid
         from (select encode(extensions.digest(
             convert_to('docket_room:legiscan:'||v_source_bill_id::text,'UTF8'),
             'sha256'), 'hex') as h) canonical_hash
       ), 'TX', '2160',
      v_number, 'Synthetic CI bill for trigger replay',
      repeat('a', 64),
      jsonb_build_object(
        'source_bill_id', v_source_bill_id::text,
        'source_transport', 'legiscan_bulk_json'
      )
    ) returning genome_bill_id into v_genome_bill_id;
    v_duration_ms := round((extract(epoch from clock_timestamp() - v_start) * 1000)::numeric, 1);

    -- Detail and Genome triggers enqueue one idempotent work item. Process it
    -- through the same leased contract used by the background worker before
    -- asserting lifecycle history and source-version registration.
    select work.work_id, work.source_bill_id, work.docket_fetched_at
      into v_work_id, v_work_source_bill_id, v_work_fetched_at
    from public.claim_docket_bill_detail_derived_work_v1(
      'ci-real-lifecycle-trigger-worker', 1
    ) work;
    if v_work_id is null or v_work_source_bill_id <> v_source_bill_id
        or v_work_fetched_at is distinct from timestamptz '2026-11-14 12:00:00+00' then
      raise exception 'real_spine_outbox_claim_mismatch history=% claimed_source=% claimed_fetched_at=%',
        v_history_length, v_work_source_bill_id, v_work_fetched_at;
    end if;
    select public.process_docket_bill_detail_derived_work_v1(
      v_work_source_bill_id, v_work_fetched_at
    ) into v_work_receipt;
    select public.complete_docket_bill_detail_derived_work_v1(
      v_work_id, 'ci-real-lifecycle-trigger-worker', v_work_receipt
    ) into v_work_completed;
    if v_work_completed is not true or v_work_receipt->>'status' <> 'processed' then
      raise exception 'real_spine_outbox_process_mismatch history=% receipt=% completed=%',
        v_history_length, v_work_receipt, v_work_completed;
    end if;

    -- Registration must have actually run on the real AFTER INSERT trigger.
    select count(*)::integer into v_document_count
    from public.docket_bill_source_document
    where source_bill_id = v_source_bill_id;
    select count(*)::integer into v_observation_count
    from public.docket_bill_source_document_observation observation
    join public.docket_bill_source_document document
      on document.source_document_key = observation.source_document_key
    where document.source_bill_id = v_source_bill_id;
    select count(*)::integer into v_version_count
    from public.civic_genome_bill_version
    where genome_bill_id = v_genome_bill_id and source_bill_id = v_source_bill_id;
    select count(*)::integer into v_version_queue_count
    from public.civic_genome_legislative_version_queue queue
    join public.civic_genome_bill_version version
      on version.bill_version_id = queue.bill_version_id
    where version.genome_bill_id = v_genome_bill_id;

    if v_document_count <> 2 or v_observation_count <> 2
        or v_version_count <> 2 or v_version_queue_count <> 0
        or (select count(*) from public.docket_bill_source_document
            where source_bill_id = v_source_bill_id
              and document_family = 'text') <> 1
        or (select count(*) from public.docket_bill_source_document
            where source_bill_id = v_source_bill_id
              and document_family = 'amendment') <> 1 then
      raise exception 'real_spine_registration_mismatch history=% docs=% observations=% versions=% enqueued=%',
        v_history_length, v_document_count, v_observation_count,
        v_version_count, v_version_queue_count;
    end if;

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

    -- On the long-history case exercise UPDATE trigger wiring (not just direct
    -- function invocation): replace action, remove all history, then restore.
    if v_history_length = 66 then
      select event.lifecycle_event_id into v_first_original_event_id
      from public.civic_genome_lifecycle_event_v2 event
      where event.genome_bill_id = v_genome_bill_id
        and event.action_text = 'Referred to standing committee 2';
      select bill.bill_id into v_original_bill_id
      from public.civic_genome_bill bill
      where bill.genome_bill_id = v_genome_bill_id;
      if v_first_original_event_id is null or v_original_bill_id is null then
        raise exception 'long_history_original_source_identity_missing';
      end if;

      v_corrected_record := jsonb_set(
        v_record, '{history,1,action}',
        to_jsonb('Effective date 7/1/2026.'::text), false
      );
      update public.docket_bill_detail_cache
         set bill = v_corrected_record,
             fetched_at = timestamptz '2026-11-14 12:00:01+00'
       where bill_id = v_source_bill_id;

      select work.work_id, work.source_bill_id, work.docket_fetched_at
        into v_work_id, v_work_source_bill_id, v_work_fetched_at
      from public.claim_docket_bill_detail_derived_work_v1(
        'ci-real-lifecycle-trigger-worker', 1
      ) work;
      if v_work_id is null or v_work_source_bill_id <> v_source_bill_id
          or v_work_fetched_at is distinct from timestamptz '2026-11-14 12:00:01+00' then
        raise exception 'long_history_correction_outbox_claim_mismatch';
      end if;
      select public.process_docket_bill_detail_derived_work_v1(
        v_work_source_bill_id, v_work_fetched_at
      ) into v_work_receipt;
      select public.complete_docket_bill_detail_derived_work_v1(
        v_work_id, 'ci-real-lifecycle-trigger-worker', v_work_receipt
      ) into v_work_completed;
      if v_work_completed is not true or v_work_receipt->>'status' <> 'processed' then
        raise exception 'long_history_correction_outbox_process_mismatch receipt=%', v_work_receipt;
      end if;

      select event.lifecycle_event_id into v_correction_event_id
      from public.v_civic_genome_lifecycle_event_current_v3 event
      where event.genome_bill_id = v_genome_bill_id
        and event.action_text = 'Effective date 7/1/2026.'
        and event.supersedes_lifecycle_event_id = v_first_original_event_id;
      select bill.bill_id, bill.effective_at
        into v_after_bill_id, v_effective_at
      from public.civic_genome_bill bill
      where bill.genome_bill_id = v_genome_bill_id;
      if v_correction_event_id is null
          or v_after_bill_id is distinct from v_original_bill_id
          or v_effective_at::date is distinct from date '2026-07-01'
          or exists (
            select 1 from public.v_civic_genome_lifecycle_event_current_v3
            where lifecycle_event_id = v_first_original_event_id
          ) then
        raise exception 'long_history_correction_not_current_or_unlinked';
      end if;

      v_empty_record := jsonb_set(v_record, '{history}', '[]'::jsonb, false);
      update public.docket_bill_detail_cache
         set bill = v_empty_record,
             fetched_at = timestamptz '2026-11-14 12:00:02+00'
       where bill_id = v_source_bill_id;
      select work.work_id, work.source_bill_id, work.docket_fetched_at
        into v_work_id, v_work_source_bill_id, v_work_fetched_at
      from public.claim_docket_bill_detail_derived_work_v1(
        'ci-real-lifecycle-trigger-worker', 1
      ) work;
      if v_work_id is null or v_work_source_bill_id <> v_source_bill_id
          or v_work_fetched_at is distinct from timestamptz '2026-11-14 12:00:02+00' then
        raise exception 'long_history_delete_outbox_claim_mismatch';
      end if;
      select public.process_docket_bill_detail_derived_work_v1(
        v_work_source_bill_id, v_work_fetched_at
      ) into v_work_receipt;
      select public.complete_docket_bill_detail_derived_work_v1(
        v_work_id, 'ci-real-lifecycle-trigger-worker', v_work_receipt
      ) into v_work_completed;
      if v_work_completed is not true or v_work_receipt->>'status' <> 'processed' then
        raise exception 'long_history_delete_outbox_process_mismatch receipt=%', v_work_receipt;
      end if;
      select count(*)::integer into v_current_events
      from public.v_civic_genome_lifecycle_event_current_v3
      where genome_bill_id = v_genome_bill_id;
      select bill.bill_id, bill.effective_at, bill.current_state_position
        into v_after_bill_id, v_effective_at, v_current_state
      from public.civic_genome_bill bill
      where bill.genome_bill_id = v_genome_bill_id;
      select count(*)::integer into v_tombstone_count
      from public.civic_genome_lifecycle_event_v2
      where genome_bill_id = v_genome_bill_id
        and event_type = 'source_tombstone'
        and supersedes_lifecycle_event_id = v_correction_event_id;
      if v_current_events <> 0 or v_tombstone_count <> 1
          or v_effective_at is not null or v_current_state is not null
          or v_after_bill_id is distinct from v_original_bill_id then
        raise exception 'long_history_deleted_events_or_temporal_projection_stale current=% tombstones=%',
          v_current_events, v_tombstone_count;
      end if;

      update public.docket_bill_detail_cache
         set bill = v_record,
             fetched_at = timestamptz '2026-11-14 12:00:03+00'
       where bill_id = v_source_bill_id;
      select work.work_id, work.source_bill_id, work.docket_fetched_at
        into v_work_id, v_work_source_bill_id, v_work_fetched_at
      from public.claim_docket_bill_detail_derived_work_v1(
        'ci-real-lifecycle-trigger-worker', 1
      ) work;
      if v_work_id is null or v_work_source_bill_id <> v_source_bill_id
          or v_work_fetched_at is distinct from timestamptz '2026-11-14 12:00:03+00' then
        raise exception 'long_history_restore_outbox_claim_mismatch';
      end if;
      select public.process_docket_bill_detail_derived_work_v1(
        v_work_source_bill_id, v_work_fetched_at
      ) into v_work_receipt;
      select public.complete_docket_bill_detail_derived_work_v1(
        v_work_id, 'ci-real-lifecycle-trigger-worker', v_work_receipt
      ) into v_work_completed;
      if v_work_completed is not true or v_work_receipt->>'status' <> 'processed' then
        raise exception 'long_history_restore_outbox_process_mismatch receipt=%', v_work_receipt;
      end if;
      select count(*)::integer into v_current_events
      from public.v_civic_genome_lifecycle_event_current_v3
      where genome_bill_id = v_genome_bill_id;
      select bill.bill_id, bill.effective_at, bill.current_state_position
        into v_after_bill_id, v_effective_at, v_current_state
      from public.civic_genome_bill bill
      where bill.genome_bill_id = v_genome_bill_id;
      if v_current_events <> 66
          or v_after_bill_id is distinct from v_original_bill_id
          or v_effective_at is not null
          or v_current_state is distinct from 'active_in_committee'
          or not exists (
            select 1 from public.v_civic_genome_lifecycle_event_current_v3
            where lifecycle_event_id = v_first_original_event_id
          )
          or exists (
            select 1 from public.v_civic_genome_lifecycle_event_current_v3
            where lifecycle_event_id = v_correction_event_id
          ) then
        raise exception 'long_history_restoration_not_canonical current=% state=%',
          v_current_events, v_current_state;
      end if;

      select count(*)::integer into v_after_events
      from public.civic_genome_lifecycle_event_v2
      where genome_bill_id = v_genome_bill_id;
      select count(*)::integer into v_after_revisions
      from public.civic_genome_lifecycle_source_revision_v3
      where genome_bill_id = v_genome_bill_id;

      -- Exact replay through the UPDATE trigger must not grow immutable ledgers.
      update public.docket_bill_detail_cache
         set bill = v_record,
             fetched_at = timestamptz '2026-11-14 12:00:03+00'
       where bill_id = v_source_bill_id;
      select work.work_id, work.source_bill_id, work.docket_fetched_at
        into v_work_id, v_work_source_bill_id, v_work_fetched_at
      from public.claim_docket_bill_detail_derived_work_v1(
        'ci-real-lifecycle-trigger-worker', 1
      ) work;
      if v_work_id is null or v_work_source_bill_id <> v_source_bill_id
          or v_work_fetched_at is distinct from timestamptz '2026-11-14 12:00:03+00' then
        raise exception 'long_history_exact_replay_outbox_claim_mismatch';
      end if;
      select public.process_docket_bill_detail_derived_work_v1(
        v_work_source_bill_id, v_work_fetched_at
      ) into v_work_receipt;
      select public.complete_docket_bill_detail_derived_work_v1(
        v_work_id, 'ci-real-lifecycle-trigger-worker', v_work_receipt
      ) into v_work_completed;
      if v_work_completed is not true or v_work_receipt->>'status' <> 'processed' then
        raise exception 'long_history_exact_replay_outbox_process_mismatch receipt=%', v_work_receipt;
      end if;
      if v_after_events <> (
          select count(*) from public.civic_genome_lifecycle_event_v2
          where genome_bill_id = v_genome_bill_id
        ) or v_after_revisions <> (
          select count(*) from public.civic_genome_lifecycle_source_revision_v3
          where genome_bill_id = v_genome_bill_id
        ) or exists (
          select 1 from public.civic_genome_legislative_version_queue queue
          join public.civic_genome_bill_version version
            on version.bill_version_id = queue.bill_version_id
          where version.genome_bill_id = v_genome_bill_id
        ) then
        raise exception 'long_history_exact_update_replay_mutated_ledger_or_queue';
      end if;

      raise notice 'lifecycle_correction_delete_restore_verified history=66 current=66 replays_idempotent=true';
    end if;

    raise notice 'lifecycle_real_trigger_verified history=% events=% revisions=% docs=% insert_ms=%',
      v_history_length, v_actual_events, v_revisions, v_document_count, v_duration_ms;
  end loop;
end
$acceptance$;

rollback;
