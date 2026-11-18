-- Candidate-only full lifecycle generic-plan acceptance. The SQL is
-- extracted from the installed PL/pgSQL function, and planner probe uses
-- 39,410 temporary indexed Genome bills. Must run only in disposable replay.
-- Disposable CI only. Not a production migration or live data operation.
-- Plan probe uses PostgreSQL 17 GENERIC_PLAN on the *actual scoped CTE*
-- extracted from the installed SQL SECURITY DEFINER function body.
-- Realistic 39,410-source cardinality is simulated in temporary indexed
-- The source-ID adversarial pair checks the historical exact-text identity contract,
-- not merely that both candidate rows produce an index-shaped plan.
-- tables, without invoking production triggers or paid provider APIs.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';
create temp table docket_history_probe_genome (
  genome_bill_id uuid not null,
  bill_id uuid not null,
  state_code text not null,
  structural_dna_json jsonb not null
) on commit drop;
create unique index docket_history_probe_bill_id_idx
  on docket_history_probe_genome(bill_id);

create temp table docket_history_probe_cache (
  bill_id integer primary key,
  bill jsonb not null,
  fetched_at timestamptz not null
) on commit drop;

insert into docket_history_probe_genome(
  genome_bill_id,bill_id,state_code,structural_dna_json
)
select gen_random_uuid(),gen_random_uuid(),'WA',
  jsonb_build_object(
    'source_bill_id',(1900000 + n)::text,
    'fixture_padding',repeat('x',500)
  )
from generate_series(1,39410) as n;

insert into docket_history_probe_cache(bill_id,bill,fetched_at)
select 1900000 + n, '{"history":[]}'::jsonb, now()
from generate_series(1,39410) as n;

-- Adversarial semantic pair: integer identity and canonical UUID match, but
-- the negative record's source ID is textually noncanonical ("029000000").
-- Prior behavior required exact text equality and excluded this record.
insert into docket_history_probe_genome(genome_bill_id,bill_id,state_code,structural_dna_json)
select gen_random_uuid(),
  (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'
   ||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)
   ||substr(h,18,3)||'-'||substr(h,21,12))::uuid,
  'WA',jsonb_build_object('source_bill_id',source.source_id_text)
from (values (290000000,'029000000'),(290000001,'290000001')) source(source_id,source_id_text)
cross join lateral (
  select encode(extensions.digest(
    convert_to('docket_room:legiscan:'||source.source_id::text,'UTF8'),
    'sha256'
  ),'hex') as h
) hashed;
insert into docket_history_probe_cache(bill_id,bill,fetched_at)
values (290000000,'{"history":[]}'::jsonb,now()),
       (290000001,'{"history":[]}'::jsonb,now());

analyze docket_history_probe_genome;
analyze docket_history_probe_cache;

do $verify$
declare
  v_ddl text;
  v_body text;
  v_source_start integer;
  v_source_end integer;
  v_plan_text text;
  v_explain_query text;
  v_index_branch boolean;
  v_null_guard boolean;
  v_nonpositive_guard boolean;
  v_identity_body text;
  v_identity_count bigint;
begin
  select pg_get_functiondef(p.oid) into v_ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='sync_civic_genome_lifecycle_history_v3';
  if v_ddl is null
      or position('SECURITY DEFINER' in v_ddl)=0
      or position('with targets as materialized (' in v_ddl)=0 then
    raise exception 'candidate_full_lifecycle_function_not_installed';
  end if;

  v_source_start := strpos(v_ddl, 'with targets as materialized (');
  v_source_end := strpos(v_ddl, '), current_history as materialized (');
  if v_source_end <= v_source_start then
    raise exception 'candidate_lifecycle_targets_extraction_failed';
  end if;

  -- Derive the query under test from the INSTALLED function, rather than
  -- copying a simplified approximation of its scoped/unscoped branches.
  v_body := substr(v_ddl, v_source_start, v_source_end-v_source_start+1);
  if length(v_body) < 1500
      or position('union all' in lower(v_body))=0
      or position('p_source_bill_id > 0' in v_body)=0
      or position('p_source_bill_id is null' in v_body)=0
      or position('p_source_bill_id <= 0' in v_body)=0 then
    raise exception 'candidate_lifecycle_target_branches_missing';
  end if;

  if position('bill.structural_dna_json->>''source_bill_id'' = p_source_bill_id::text' in v_body)=0 then
    raise exception 'candidate_exact_source_id_text_predicate_missing';
  end if;
  v_body := replace(v_body,
    'public.civic_genome_bill', 'pg_temp.docket_history_probe_genome');
  v_body := replace(v_body,
    'public.docket_bill_detail_cache', 'pg_temp.docket_history_probe_cache');

  -- Execute the actual extracted candidate CTE for both a deliberately
  -- mismatched textual identity and its canonical positive control.
  v_identity_body := replace(v_body, 'p_source_bill_id', '290000000');
  v_explain_query := v_identity_body||' SELECT COUNT(*) FROM targets';
  execute v_explain_query into v_identity_count;
  if v_identity_count <> 0 then
    raise exception 'noncanonical_source_id_text_was_admitted count=%',v_identity_count;
  end if;
  v_identity_body := replace(v_body, 'p_source_bill_id', '290000001');
  v_explain_query := v_identity_body||' SELECT COUNT(*) FROM targets';
  execute v_explain_query into v_identity_count;
  if v_identity_count <> 1 then
    raise exception 'canonical_source_id_control_missing count=%',v_identity_count;
  end if;

  v_body := replace(v_body,'p_source_bill_id','$1::integer');
  v_explain_query := 'EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON) '
    ||v_body||' SELECT COUNT(*) FROM targets';
  execute v_explain_query into v_plan_text;
  v_index_branch := position('"Index Name": "docket_history_probe_bill_id_idx"' in v_plan_text)>0;
  v_null_guard := position('"One-Time Filter": "($1 IS NULL)"' in v_plan_text)>0;
  v_nonpositive_guard := position('"One-Time Filter": "($1 <= 0)"' in v_plan_text)>0;
  if not v_index_branch
    or position('"One-Time Filter": "($1 > 0)"' in v_plan_text)=0
    or not v_null_guard
    or not v_nonpositive_guard then
    raise exception 'generic_lifecycle_targets_plan_not_bounded index=% null=% nonpositive=% plan=%',
      v_index_branch,v_null_guard,v_nonpositive_guard,left(v_plan_text,5000);
  end if;

  raise notice 'docket_full_lifecycle_targets_generic_plan_pass indexed_positive=true null_branch_guarded=true nonpositive_branch_guarded=true fixture=39410';
end;
$verify$;
rollback;
