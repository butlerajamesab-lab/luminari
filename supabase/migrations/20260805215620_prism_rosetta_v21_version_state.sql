begin;

alter table public.civic_genome_bill_version
  drop constraint if exists civic_genome_bill_version_processing_state_check;

alter table public.civic_genome_bill_version
  add constraint civic_genome_bill_version_processing_state_check
  check (processing_state in (
    'registered',
    'source_ingested',
    'extracted',
    'assembled',
    'verification_partial',
    'verified_with_findings',
    'verified',
    'failed'
  ));

create or replace function public.civic_genome_prism_version_state(
  p_expected_trait_count integer,
  p_receipt_count integer,
  p_status_counts jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_receipt_count, 0) <> coalesce(p_expected_trait_count, 0)
      then 'verification_partial'
    when coalesce((p_status_counts ->> 'contradicted')::integer, 0) > 0
      or coalesce((p_status_counts ->> 'incomplete')::integer, 0) > 0
      or coalesce((p_status_counts ->> 'disputed')::integer, 0) > 0
      or coalesce((p_status_counts ->> 'unresolved')::integer, 0) > 0
      then 'verified_with_findings'
    else 'verified'
  end;
$$;

create or replace function public.record_civic_genome_version_prism_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_processing_state text;
begin
  v_processing_state := public.civic_genome_prism_version_state(
    new.expected_trait_count,
    new.receipt_count,
    new.status_counts
  );

  update public.civic_genome_bill_version
     set prism_verification_run_id = new.verification_run_id,
         processing_state = v_processing_state,
         receipt_json = receipt_json || jsonb_build_object(
           'prism_verification_run_id', new.verification_run_id,
           'prism_engine_version', new.prism_engine_version,
           'prism_rule_set_id', new.prism_rule_set_id,
           'prism_rule_set_version', new.prism_rule_set_version,
           'prism_expected_trait_count', new.expected_trait_count,
           'prism_receipt_count', new.receipt_count,
           'prism_status_counts', new.status_counts,
           'prism_output_hash', new.output_hash,
           'prism_receipt_manifest_hash', new.receipt_manifest_hash,
           'prism_completed_at', new.completed_at,
           'prism_version_state', v_processing_state
         ),
         updated_at = now()
   where assembly_run_id = new.assembly_run_id;
  return new;
end;
$$;

create or replace function public.enqueue_civic_genome_prism_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.run_status = 'completed'
     and new.verification_state = 'complete'
     and new.trait_count > 0 then
    insert into public.civic_genome_prism_verification_queue (
      assembly_run_id,
      genome_bill_id,
      prism_rule_set_id,
      prism_rule_set_version,
      queue_state,
      expected_trait_count,
      receipt_count,
      eligible_at,
      next_attempt_at
    ) values (
      new.assembly_run_id,
      new.genome_bill_id,
      'prism-rosetta-structural-binding',
      '2.1.0',
      'eligible',
      new.trait_count,
      0,
      coalesce(new.completed_at, new.created_at, now()),
      now()
    )
    on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
      do nothing;
  end if;
  return new;
end;
$$;

do $migration$
declare
  v_sql text;
  v_changed text;
begin
  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_sql;

  if v_sql is null then
    raise exception 'register_docket_legislative_version_spine is missing';
  end if;

  v_changed := replace(
    v_sql,
    'and version.processing_state <> ''verified''',
    'and version.processing_state not in (''verified'', ''verified_with_findings'')'
  );
  v_changed := replace(
    v_changed,
    'when public.civic_genome_legislative_version_queue.queue_state = ''completed'' then ''completed''',
    'when public.civic_genome_legislative_version_queue.queue_state in (''completed'', ''permanent_failure'') then public.civic_genome_legislative_version_queue.queue_state'
  );

  if v_changed = v_sql
     or position(
       'version.processing_state not in (''verified'', ''verified_with_findings'')'
       in v_changed
     ) = 0
     or position(
       'queue_state in (''completed'', ''permanent_failure'')'
       in v_changed
     ) = 0 then
    raise exception 'Legislative-version queue terminal-state patch failed';
  end if;

  execute v_changed;
end;
$migration$;

update public.civic_genome_bill_version version
   set processing_state = public.civic_genome_prism_version_state(
         verification.expected_trait_count,
         verification.receipt_count,
         verification.status_counts
       ),
       receipt_json = version.receipt_json || jsonb_build_object(
         'prism_version_state', public.civic_genome_prism_version_state(
           verification.expected_trait_count,
           verification.receipt_count,
           verification.status_counts
         )
       ),
       updated_at = now()
  from public.civic_genome_prism_verification_run verification
 where verification.verification_run_id = version.prism_verification_run_id;

revoke all on function public.civic_genome_prism_version_state(integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_civic_genome_version_prism_completion()
  from public, anon, authenticated;
revoke all on function public.enqueue_civic_genome_prism_verification()
  from public, anon, authenticated;

comment on function public.civic_genome_prism_version_state(integer, integer, jsonb) is
  'Maps complete Prism receipt coverage to verified only when no contradiction, incompleteness, dispute, or unresolved status remains. Full receipt coverage with substantive findings is verified_with_findings; partial receipt coverage remains verification_partial.';
comment on function public.enqueue_civic_genome_prism_verification() is
  'Queues each completed Civic Genome assembly for the governed Prism Rosetta structural-binding 2.1.0 contract without rewriting preserved 2.0.0 receipts.';
comment on function public.record_civic_genome_version_prism_completion() is
  'Binds a Prism verification generation to the exact Civic Genome bill version and distinguishes clean verification from complete verification containing findings.';

commit;
