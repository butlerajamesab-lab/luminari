-- Disposable CI only. Not a production migration or live data operation.
-- Plan probe uses PostgreSQL 17 GENERIC_PLAN on the *actual scoped CTE*
-- extracted from the installed SQL SECURITY DEFINER function body.
-- Realistic 39,410-source cardinality is simulated in temporary indexed
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
begin
  select pg_get_functiondef(p.oid) into v_ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='civic_genome_normalized_source_history_v3_unscoped';
  if v_ddl is null
      or position('SECURITY DEFINER' in v_ddl)=0
      or position('with source_rows as materialized (' in v_ddl)=0 then
    raise exception 'candidate_scoped_history_function_not_installed';
  end if;

  v_source_start := strpos(v_ddl, 'with source_rows as materialized (');
  v_source_end := strpos(v_ddl, '), raw_history as materialized (');
  if v_source_end <= v_source_start then
    raise exception 'candidate_source_rows_extraction_failed';
  end if;

  -- Derive the query under test from the INSTALLED function, rather than
  -- copying a simplified approximation of its scoped/unscoped branches.
  v_body := substr(v_ddl, v_source_start, v_source_end-v_source_start+1);
  if length(v_body) < 1500
      or position('union all' in lower(v_body))=0
      or position('p_source_bill_id > 0' in v_body)=0
      or position('p_source_bill_id is null' in v_body)=0
      or position('p_source_bill_id <= 0' in v_body)=0 then
    raise exception 'candidate_branches_missing';
  end if;

  v_body := replace(v_body,
    'public.civic_genome_bill', 'pg_temp.docket_history_probe_genome');
  v_body := replace(v_body,
    'public.docket_bill_detail_cache', 'pg_temp.docket_history_probe_cache');
  v_body := replace(v_body,'p_source_bill_id','$1::integer');
  v_explain_query := 'EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON) '
    ||v_body||' SELECT COUNT(*) FROM source_rows';
  execute v_explain_query into v_plan_text;
  v_index_branch := position('"Index Name": "docket_history_probe_bill_id_idx"' in v_plan_text)>0;
  v_null_guard := position('"One-Time Filter": "($1 IS NULL)"' in v_plan_text)>0;
  v_nonpositive_guard := position('"One-Time Filter": "($1 <= 0)"' in v_plan_text)>0;
  if not v_index_branch
    or position('"One-Time Filter": "($1 > 0)"' in v_plan_text)=0
    or not v_null_guard
    or not v_nonpositive_guard then
    raise exception 'generic_scoped_plan_not_bounded index=% null=% nonpositive=% plan=%',
      v_index_branch,v_null_guard,v_nonpositive_guard,left(v_plan_text,5000);
  end if;

  raise notice 'docket_generic_function_plan_pass indexed_positive=true null_branch_guarded=true nonpositive_branch_guarded=true fixture=39410';
end;
$verify$;
rollback;
