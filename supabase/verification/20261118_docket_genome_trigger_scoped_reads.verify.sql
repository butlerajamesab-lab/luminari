-- Disposable Supabase replay ONLY, after proposal install. No production SQL.
-- Explicitly inspect installed SECURITY DEFINER trigger callees and prove the
-- scoped positive branches choose the existing indexes in a generic plan.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $assert_function_shape$
declare l text;r text;
begin
  select pg_get_functiondef(p.oid) into l
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sync_civic_genome_lifecycle_history_v3';
  select pg_get_functiondef(p.oid) into r
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='register_docket_legislative_version_spine';
  if l is null or r is null
    or position('SECURITY DEFINER' in l)=0 or position('SECURITY DEFINER' in r)=0
    or position('p_source_bill_id is null' in l)=0
    or position('p_source_bill_id is not null' in l)=0
    or position('source_identity_hash' in l)=0
    or position('source_identity_hash' in r)=0
    or position('p_source_bill_id <= 0' in r)=0
    or position('civic_genome_source_bill_in_sync_scope_v3' in l)=0
    or position('register_docket_legislative_version_spine' in r)=0 then
    raise exception 'trigger_indexed_scope_proposal_shape_not_installed';
  end if;
  raise notice 'trigger_indexed_scope_proposal_shape_pass';
end;
$assert_function_shape$;

-- Actual function bodies are sourced from pg_get_functiondef below, never
-- replaced by simplified hand-authored lookups. These fixture tables match
-- only columns used by those real source-row CTEs and trigger lookup query.
create temp table trigger_probe_revision(
 source_bill_id integer not null, genome_bill_id uuid not null,
 observed_at timestamptz not null, created_at timestamptz not null,
 source_revision_id uuid not null, source_event_keys text[] not null default '{}'
) on commit drop;
create index trigger_probe_revision_source_idx on trigger_probe_revision(source_bill_id,observed_at desc);

create temp table trigger_probe_event(
 source_bill_id integer not null, genome_bill_id uuid not null,
 source_event_key text not null, event_type text not null
) on commit drop;
create index trigger_probe_event_source_idx on trigger_probe_event(source_bill_id);
-- Mirror BOTH live event join access paths, not only source-ID fallback.
-- Production has unique source_event_key and Genome-leading indexes.
create unique index trigger_probe_event_key_unique on trigger_probe_event(source_event_key);
create index trigger_probe_event_genome_idx on trigger_probe_event(genome_bill_id);

create temp table trigger_probe_genome(
 bill_id uuid not null, genome_bill_id uuid not null,
 structural_dna_json jsonb not null, updated_at timestamptz not null
) on commit drop;
create unique index trigger_probe_genome_bill_uuid_idx on trigger_probe_genome(bill_id);

create temp table trigger_probe_cache(
 bill_id integer primary key, bill jsonb not null, fetched_at timestamptz not null
) on commit drop;

insert into trigger_probe_revision(source_bill_id,genome_bill_id,observed_at,created_at,source_revision_id,source_event_keys)
select 1900000+i,gen_random_uuid(),now(),now(),gen_random_uuid(),ARRAY[i::text]
from generate_series(1,39410) i;
insert into trigger_probe_event
select 1900000+i,gen_random_uuid(),i::text,'legislative_action'
from generate_series(1,39410) i;
insert into trigger_probe_genome
select gen_random_uuid(),gen_random_uuid(),jsonb_build_object('source_bill_id',(1900000+i)::text),now()
from generate_series(1,39410) i;
insert into trigger_probe_cache
select 1900000+i,'{"history":[]}'::jsonb,now()
from generate_series(1,39410) i;
analyze trigger_probe_revision;
analyze trigger_probe_event;
analyze trigger_probe_genome;
analyze trigger_probe_cache;

do $verify_actual_function_generic_plans$
declare
 l text; r text; stmt text; plan text;
 start_pos integer; end_pos integer;
begin
 select pg_get_functiondef(p.oid) into l
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='sync_civic_genome_lifecycle_history_v3';
 select pg_get_functiondef(p.oid) into r
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='register_docket_legislative_version_spine';

 -- Extract latest_prior_revision AND prior_active CTEs as a single statement,
 -- so DISTINCT, ordering, fallback source scans and join conditions all remain.
 start_pos := strpos(l,'latest_prior_revision as materialized (');
 end_pos := strpos(l,'), stable_event as materialized (');
 if start_pos=0 or end_pos<=start_pos then
   raise exception 'actual_prior_revision_and_event_CTE_not_found';
 end if;
 stmt := substr(l,start_pos,end_pos-start_pos+1);
 stmt := replace(stmt,'public.civic_genome_lifecycle_source_revision_v3','pg_temp.trigger_probe_revision');
 stmt := replace(stmt,'public.civic_genome_lifecycle_event_v2','pg_temp.trigger_probe_event');
 stmt := replace(stmt,'p_source_bill_id','$1::integer');
 execute 'EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON) WITH '||stmt||
   ' SELECT count(*) FROM prior_active' into plan;
 if position('"Index Name": "trigger_probe_revision_source_idx"' in plan)=0
    or position('"Index Name": "trigger_probe_event_source_idx"' in plan)=0
    or (
      position('"Index Name": "trigger_probe_event_key_unique"' in plan)=0
      and position('"Index Name": "trigger_probe_event_genome_idx"' in plan)=0
    )
    or position('"One-Time Filter": "($1 IS NOT NULL)"' in plan)=0 then
   raise exception 'actual_prior_event_generic_plan_not_bounded %',left(plan,5000);
 end if;

 -- Extract the real lifecycle revision targets CTE including source-cache join
 -- and scope helper, preserving all null/nonpositive branches.
 start_pos := strpos(l,'with targets as materialized (');
 end_pos := strpos(l,'), current_history as materialized (');
 if start_pos=0 or end_pos<=start_pos then
   raise exception 'actual_lifecycle_targets_CTE_not_found';
 end if;
 stmt := substr(l,start_pos,end_pos-start_pos+1);
 stmt := replace(stmt,'public.civic_genome_bill','pg_temp.trigger_probe_genome');
 stmt := replace(stmt,'public.docket_bill_detail_cache','pg_temp.trigger_probe_cache');
 stmt := replace(stmt,'p_source_bill_id','$1::integer');
 execute 'EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON) '||stmt||
   ' SELECT count(*) FROM targets' into plan;
 if position('"Index Name": "trigger_probe_genome_bill_uuid_idx"' in plan)=0
    or position('"Index Name": "trigger_probe_cache_pkey"' in plan)=0
    or position('"One-Time Filter": "($1 > 0)"' in plan)=0
    or position('"One-Time Filter": "($1 IS NULL)"' in plan)=0 then
   raise exception 'actual_lifecycle_targets_generic_plan_not_bounded %',left(plan,5000);
 end if;

 -- Extract full existing version-spine bill lookup, not just bare UUID match.
 start_pos := strpos(r,'select candidate.genome_bill_id');
 if start_pos=0 then raise exception 'actual_version_registration_lookup_not_found'; end if;
 end_pos := strpos(substr(r,start_pos),'limit 1;');
 if end_pos=0 then raise exception 'actual_version_registration_limit_not_found'; end if;
 stmt := substr(r,start_pos,end_pos+length('limit 1;')-1);
 stmt := replace(stmt,'into v_genome_bill_id','');
 stmt := replace(stmt,'public.civic_genome_bill','pg_temp.trigger_probe_genome');
 stmt := replace(stmt,'p_source_bill_id','$1::integer');
 stmt := trim(trailing ';' from stmt);
 execute 'EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON) '||stmt into plan;
 if position('"Index Name": "trigger_probe_genome_bill_uuid_idx"' in plan)=0
    or position('"One-Time Filter": "($1 > 0)"' in plan)=0 then
   raise exception 'actual_version_spine_generic_plan_not_bounded %',left(plan,5000);
 end if;

 raise notice 'actual_trigger_function_generic_plans_pass revision_source_index=true event_source_and_event_join_indexes=true targets_with_cache=true version_spine=true fixture=39410';
end;
$verify_actual_function_generic_plans$;
rollback;
