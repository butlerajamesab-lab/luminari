begin;

do $$
declare
  target_genome_bill_id uuid;
  target_family_id uuid;
  facts record;
  before_count bigint;
  after_count bigint;
  legacy_snapshot_count integer;
  receipt_legacy_snapshot_count integer;
begin
  if to_regclass('public.civic_genome_lifecycle_event_v2') is null then
    raise exception 'event-time lifecycle ledger is missing';
  end if;

  if to_regclass('public.v_civic_genome_bill_temporal_facts_v2') is null then
    raise exception 'event-time temporal facts view is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.civic_genome_lifecycle_event_v2'::regclass
      and trigger_record.tgname = 'civic_genome_lifecycle_event_v2_append_only'
      and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'event-time lifecycle append-only trigger is missing or disabled';
  end if;

  if not exists (
    select 1
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'civic_genome_family_momentum_event_time_v2'
  ) then
    raise exception 'event-time momentum replay function is missing';
  end if;

  select count(*)
    into legacy_snapshot_count
    from public.family_momentum_snapshot;

  select receipt.legacy_snapshot_count
    into receipt_legacy_snapshot_count
    from public.civic_genome_temporal_reconciliation_receipt_v2 receipt
    order by receipt.created_at desc, receipt.reconciliation_receipt_id desc
    limit 1;

  if receipt_legacy_snapshot_count is distinct from legacy_snapshot_count then
    raise exception
      'legacy momentum snapshot count changed after temporal reconciliation';
  end if;

  select bill.genome_bill_id, bill.family_id
    into target_genome_bill_id, target_family_id
    from public.civic_genome_bill bill
    where bill.state_code = 'WA'
      and upper(replace(bill.source_bill_number, ' ', '')) = 'SB5124'
    order by bill.updated_at desc
    limit 1;

  if target_genome_bill_id is null then
    return;
  end if;

  select *
    into facts
    from public.v_civic_genome_bill_temporal_facts_v2
    where genome_bill_id = target_genome_bill_id;

  if facts.prefiled_at::date is distinct from date '2024-12-30'
     or facts.introduced_at::date is distinct from date '2025-01-13'
     or facts.enacted_at::date is distinct from date '2026-03-24'
     or facts.effective_at::date is distinct from date '2026-06-11'
     or facts.last_action_at::date is distinct from date '2026-03-24'
  then
    raise exception 'SB5124 source-event chronology is incorrect: %', to_jsonb(facts);
  end if;

  if facts.last_observed_at::date < date '2026-07-01' then
    raise exception 'SB5124 observation time was conflated with legal event time';
  end if;

  if exists (
    select 1
    from public.civic_genome_family_momentum_event_time_v2(
      target_family_id,
      now()
    ) snapshot
    where snapshot.enacted_state_count > 0
      and snapshot.snapshot_date > date '2026-03-24'
  ) then
    raise exception 'SB5124 enactment momentum was shifted to receipt time';
  end if;

  if not exists (
    select 1
    from public.civic_genome_family_momentum_event_time_v2(
      target_family_id,
      now()
    ) snapshot
    where snapshot.snapshot_date = date '2026-03-24'
      and snapshot.enacted_state_count > 0
      and snapshot.chronology_basis = 'source_event_time'
  ) then
    raise exception 'SB5124 event-time enactment snapshot is missing';
  end if;

  select count(*)
    into before_count
    from public.civic_genome_lifecycle_event_v2
    where genome_bill_id = target_genome_bill_id;

  perform public.sync_civic_genome_lifecycle_history_v2(1900268);

  select count(*)
    into after_count
    from public.civic_genome_lifecycle_event_v2
    where genome_bill_id = target_genome_bill_id;

  if after_count <> before_count then
    raise exception 'exact lifecycle replay duplicated append-only history';
  end if;

  begin
    update public.civic_genome_lifecycle_event_v2
       set action_text = action_text
     where lifecycle_event_id = (
       select event.lifecycle_event_id
       from public.civic_genome_lifecycle_event_v2 event
       where event.genome_bill_id = target_genome_bill_id
       order by event.valid_at, event.source_sequence
       limit 1
     );
    raise exception 'lifecycle history mutation was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;
end;
$$;

rollback;
