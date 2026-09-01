begin;

do $$
declare
  target_genome_bill_id uuid;
  original_bill jsonb;
  corrected_bill jsonb;
  deleted_bill jsonb;
  shifted_corrected_bill jsonb;
  empty_bill jsonb;
  original_fetched_at timestamptz;
  test_observed_at timestamptz := clock_timestamp() + interval '1 second';
  effective_history_index integer;
  earlier_history_index integer;
  removed_action_text text;
  original_effective_event_id uuid;
  corrected_effective_event_id uuid;
  shifted_corrected_event_id uuid;
  removed_event_id uuid;
  original_current_count integer;
  restored_current_count integer;
  before_replay_event_count bigint;
  after_replay_event_count bigint;
  before_replay_revision_count bigint;
  after_replay_revision_count bigint;
  facts record;
  projected_bill record;
begin
  if to_regclass('public.civic_genome_lifecycle_source_revision_v3') is null then
    raise exception 'source revision ledger is missing';
  end if;

  if to_regclass('public.v_civic_genome_lifecycle_event_current_v3') is null then
    raise exception 'correction-aware current lifecycle view is missing';
  end if;

  if to_regclass('public.v_civic_genome_lifecycle_event_history_v3') is null then
    raise exception 'lifecycle history status view is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid =
      'public.civic_genome_lifecycle_source_revision_v3'::regclass
      and trigger_record.tgname =
        'civic_genome_lifecycle_source_revision_v3_append_only'
      and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'source revision append-only trigger is missing or disabled';
  end if;

  select
    bill.genome_bill_id,
    source_cache.bill,
    source_cache.fetched_at
    into
      target_genome_bill_id,
      original_bill,
      original_fetched_at
  from public.civic_genome_bill bill
  join public.docket_bill_detail_cache source_cache
    on source_cache.bill_id = 1900268
  where bill.state_code = 'WA'
    and upper(replace(bill.source_bill_number, ' ', '')) = 'SB5124'
  order by bill.updated_at desc
  limit 1;

  if target_genome_bill_id is null then
    return;
  end if;

  select (history.ordinality - 1)::integer
    into effective_history_index
  from jsonb_array_elements(original_bill->'history')
    with ordinality history(value, ordinality)
  where history.value->>'action' = 'Effective date 6/11/2026.'
  order by history.ordinality
  limit 1;

  if effective_history_index is null then
    raise exception 'SB5124 effective-date source action is missing';
  end if;

  select event.lifecycle_event_id
    into original_effective_event_id
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id
    and event.action_text = 'Effective date 6/11/2026.'
  limit 1;

  if original_effective_event_id is null then
    raise exception 'SB5124 original effective-date event is not current';
  end if;

  select count(*)::integer
    into original_current_count
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id;

  corrected_bill := jsonb_set(
    original_bill,
    array['history', effective_history_index::text, 'action'],
    to_jsonb('Effective date 7/1/2026.'::text),
    false
  );

  update public.docket_bill_detail_cache
     set bill = corrected_bill,
         fetched_at = test_observed_at
   where bill_id = 1900268;

  select *
    into facts
  from public.v_civic_genome_bill_temporal_facts_v3
  where genome_bill_id = target_genome_bill_id;

  if facts.effective_at::date is distinct from date '2026-07-01' then
    raise exception 'corrected effective date did not become canonical: %',
      to_jsonb(facts);
  end if;

  if exists (
    select 1
    from public.v_civic_genome_lifecycle_event_current_v3 event
    where event.lifecycle_event_id = original_effective_event_id
  ) then
    raise exception 'superseded effective-date row remained current';
  end if;

  select event.lifecycle_event_id
    into corrected_effective_event_id
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id
    and event.action_text = 'Effective date 7/1/2026.'
    and event.supersedes_lifecycle_event_id = original_effective_event_id
  limit 1;

  if corrected_effective_event_id is null then
    raise exception 'corrected action did not link to the row it superseded';
  end if;

  select jsonb_set(
    corrected_bill,
    '{history}',
    coalesce(
      (
        select jsonb_agg(history.value order by history.ordinality)
        from jsonb_array_elements(corrected_bill->'history')
          with ordinality history(value, ordinality)
        where history.ordinality <> effective_history_index + 1
      ),
      '[]'::jsonb
    ),
    false
  ) into deleted_bill;

  update public.docket_bill_detail_cache
     set bill = deleted_bill,
         fetched_at = test_observed_at + interval '1 second'
   where bill_id = 1900268;

  select *
    into facts
  from public.v_civic_genome_bill_temporal_facts_v3
  where genome_bill_id = target_genome_bill_id;

  if facts.effective_at is not null then
    raise exception 'deleted effective-date action remained canonical: %',
      to_jsonb(facts);
  end if;

  if not exists (
    select 1
    from public.civic_genome_lifecycle_event_v2 tombstone
    where tombstone.event_type = 'source_tombstone'
      and tombstone.supersedes_lifecycle_event_id = corrected_effective_event_id
  ) then
    raise exception 'deleted source action did not receive a tombstone';
  end if;

  update public.docket_bill_detail_cache
     set bill = original_bill,
         fetched_at = test_observed_at + interval '2 seconds'
   where bill_id = 1900268;

  select *
    into facts
  from public.v_civic_genome_bill_temporal_facts_v3
  where genome_bill_id = target_genome_bill_id;

  if facts.effective_at::date is distinct from date '2026-06-11' then
    raise exception 'reappearing source action was not restored: %', to_jsonb(facts);
  end if;

  if not exists (
    select 1
    from public.v_civic_genome_lifecycle_event_current_v3 event
    where event.lifecycle_event_id = original_effective_event_id
  ) then
    raise exception 'original immutable event was not reactivated by source revision';
  end if;

  if exists (
    select 1
    from public.v_civic_genome_lifecycle_event_current_v3 event
    where event.lifecycle_event_id = corrected_effective_event_id
  ) then
    raise exception 'corrected row remained current after source reverted';
  end if;

  select count(*)::integer
    into restored_current_count
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id;

  if restored_current_count <> original_current_count then
    raise exception
      'correction/delete/reappearance changed restored current event count: % -> %',
      original_current_count,
      restored_current_count;
  end if;

  select
    (history.ordinality - 1)::integer,
    history.value->>'action'
    into earlier_history_index, removed_action_text
  from jsonb_array_elements(original_bill->'history')
    with ordinality history(value, ordinality)
  where history.ordinality - 1 < effective_history_index
    and coalesce(history.value->>'action', '') <> ''
  order by history.ordinality
  limit 1;

  if earlier_history_index is null then
    raise exception 'SB5124 has no earlier action for shifted-correction test';
  end if;

  select event.lifecycle_event_id
    into removed_event_id
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id
    and event.source_sequence = earlier_history_index + 1
    and event.action_text = removed_action_text
  limit 1;

  if removed_event_id is null then
    raise exception 'earlier event for shifted-correction test is not current';
  end if;

  select jsonb_set(
    original_bill,
    '{history}',
    coalesce(
      jsonb_agg(
        case
          when history.ordinality = effective_history_index + 1
            then jsonb_set(
              history.value,
              '{action}',
              to_jsonb('Effective date 7/1/2026.'::text),
              false
            )
          else history.value
        end
        order by history.ordinality
      ) filter (
        where history.ordinality <> earlier_history_index + 1
      ),
      '[]'::jsonb
    ),
    false
  ) into shifted_corrected_bill
  from jsonb_array_elements(original_bill->'history')
    with ordinality history(value, ordinality);

  update public.docket_bill_detail_cache
     set bill = shifted_corrected_bill,
         fetched_at = test_observed_at + interval '3 seconds'
   where bill_id = 1900268;

  select event.lifecycle_event_id
    into shifted_corrected_event_id
  from public.v_civic_genome_lifecycle_event_current_v3 event
  where event.genome_bill_id = target_genome_bill_id
    and event.action_text = 'Effective date 7/1/2026.'
    and event.supersedes_lifecycle_event_id = original_effective_event_id
  limit 1;

  if shifted_corrected_event_id is null then
    raise exception
      'ordinal shift linked a correction to the wrong predecessor';
  end if;

  if not exists (
    select 1
    from public.civic_genome_lifecycle_event_v2 tombstone
    where tombstone.event_type = 'source_tombstone'
      and tombstone.supersedes_lifecycle_event_id = removed_event_id
  ) then
    raise exception 'shifted deletion did not tombstone the removed event';
  end if;

  if exists (
    select 1
    from public.civic_genome_lifecycle_event_v2 tombstone
    where tombstone.event_type = 'source_tombstone'
      and tombstone.supersedes_lifecycle_event_id = original_effective_event_id
  ) then
    raise exception 'shifted correction incorrectly tombstoned its predecessor';
  end if;

  update public.docket_bill_detail_cache
     set bill = original_bill,
         fetched_at = test_observed_at + interval '4 seconds'
   where bill_id = 1900268;

  empty_bill := jsonb_set(
    original_bill,
    '{history}',
    '[]'::jsonb,
    false
  );

  update public.docket_bill_detail_cache
     set bill = empty_bill,
         fetched_at = test_observed_at + interval '5 seconds'
   where bill_id = 1900268;

  select *
    into facts
  from public.v_civic_genome_bill_temporal_facts_v3
  where genome_bill_id = target_genome_bill_id;

  if not found then
    raise exception 'empty current revision removed the bill facts row';
  end if;

  if facts.source_event_count <> 0
     or facts.prefiled_at is not null
     or facts.introduced_at is not null
     or facts.enacted_at is not null
     or facts.effective_at is not null
     or facts.last_action_at is not null
     or facts.last_action_text is not null
     or facts.current_state_position is not null
     or facts.last_observed_at is distinct from
       test_observed_at + interval '5 seconds'
  then
    raise exception 'empty current revision retained stale facts: %',
      to_jsonb(facts);
  end if;

  select
    bill.introduced_at,
    bill.last_action_at,
    bill.enacted_at,
    bill.effective_at,
    bill.current_state_position,
    bill.procedural_lifecycle_json->>'source_event_count'
      as projected_source_event_count
    into projected_bill
  from public.civic_genome_bill bill
  where bill.genome_bill_id = target_genome_bill_id;

  if projected_bill.introduced_at is not null
     or projected_bill.last_action_at is not null
     or projected_bill.enacted_at is not null
     or projected_bill.effective_at is not null
     or projected_bill.current_state_position is not null
     or projected_bill.projected_source_event_count is distinct from '0'
  then
    raise exception 'empty current revision retained a stale bill projection: %',
      to_jsonb(projected_bill);
  end if;

  update public.docket_bill_detail_cache
     set bill = original_bill,
         fetched_at = test_observed_at + interval '6 seconds'
   where bill_id = 1900268;

  select *
    into facts
  from public.v_civic_genome_bill_temporal_facts_v3
  where genome_bill_id = target_genome_bill_id;

  if facts.effective_at::date is distinct from date '2026-06-11'
     or facts.current_state_position is distinct from 'enacted'
  then
    raise exception 'restoring empty history did not restore current facts: %',
      to_jsonb(facts);
  end if;

  select count(*)
    into before_replay_event_count
  from public.civic_genome_lifecycle_event_v2
  where genome_bill_id = target_genome_bill_id;

  select count(*)
    into before_replay_revision_count
  from public.civic_genome_lifecycle_source_revision_v3
  where genome_bill_id = target_genome_bill_id;

  perform public.sync_civic_genome_lifecycle_history_v3(1900268);

  select count(*)
    into after_replay_event_count
  from public.civic_genome_lifecycle_event_v2
  where genome_bill_id = target_genome_bill_id;

  select count(*)
    into after_replay_revision_count
  from public.civic_genome_lifecycle_source_revision_v3
  where genome_bill_id = target_genome_bill_id;

  if after_replay_event_count <> before_replay_event_count
     or after_replay_revision_count <> before_replay_revision_count
  then
    raise exception 'exact v3 replay duplicated immutable history or revision receipts';
  end if;

  begin
    update public.civic_genome_lifecycle_source_revision_v3
       set event_count = event_count
     where source_revision_id = (
       select revision.source_revision_id
       from public.civic_genome_lifecycle_source_revision_v3 revision
       where revision.genome_bill_id = target_genome_bill_id
       order by revision.observed_at desc, revision.created_at desc
       limit 1
     );
    raise exception 'source revision mutation was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  if not exists (
    select 1
    from public.civic_genome_family_momentum_event_time_v2(
      '1042d711-d388-4776-8631-00ad1ebd827e'::uuid,
      now()
    ) snapshot
    where snapshot.snapshot_date = date '2026-03-24'
      and snapshot.enacted_state_count > 0
      and snapshot.methodology_version =
        'civic_genome_momentum_event_time_v3'
  ) then
    raise exception 'correction-aware event-time momentum is missing';
  end if;

  -- Explicitly preserve the original cache receipt inside this rollback-only
  -- verification transaction. The outer rollback also removes every test row.
  update public.docket_bill_detail_cache
     set bill = original_bill,
         fetched_at = original_fetched_at
   where bill_id = 1900268;
end;
$$;

rollback;
