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

create temp table trigger_probe_revision(
 source_bill_id integer not null, genome_bill_id uuid not null,
 observed_at timestamptz not null, created_at timestamptz not null,
 source_revision_id uuid not null
) on commit drop;
create index trigger_probe_revision_source_idx on trigger_probe_revision(source_bill_id,observed_at desc);

create temp table trigger_probe_event(
 source_bill_id integer not null, genome_bill_id uuid not null,
 source_event_key text not null, event_type text not null
) on commit drop;
create index trigger_probe_event_source_idx on trigger_probe_event(source_bill_id);

create temp table trigger_probe_genome(
 bill_id uuid not null, genome_bill_id uuid not null,
 structural_dna_json jsonb not null
) on commit drop;
create unique index trigger_probe_genome_bill_uuid_idx on trigger_probe_genome(bill_id);

insert into trigger_probe_revision
select 1900000+i,gen_random_uuid(),now(),now(),gen_random_uuid()
from generate_series(1,39410) i;
insert into trigger_probe_event
select 1900000+i,gen_random_uuid(),i::text,'legislative_action'
from generate_series(1,39410) i;
insert into trigger_probe_genome
select gen_random_uuid(),gen_random_uuid(),jsonb_build_object('source_bill_id',(1900000+i)::text)
from generate_series(1,39410) i;
analyze trigger_probe_revision;
analyze trigger_probe_event;
analyze trigger_probe_genome;

do $verify_generic_index$
declare
  v_plan text;
begin
  execute $explain$EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON)
  select revision.genome_bill_id
  from (
    select r.* from pg_temp.trigger_probe_revision r
    where $1::integer is not null and r.source_bill_id=$1::integer
    union all
    select r.* from pg_temp.trigger_probe_revision r
    where $1::integer is null and r.source_bill_id between 0 and 2147483647
  ) revision
  $explain$ into v_plan;
  if position('"Index Name": "trigger_probe_revision_source_idx"' in v_plan)=0
     or position('"One-Time Filter": "($1 IS NOT NULL)"' in v_plan)=0 then
    raise exception 'revision_source_generic_index_missing %',left(v_plan,2600);
  end if;

  execute $explain$EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON)
  select event.source_event_key
  from (
    select e.* from pg_temp.trigger_probe_event e
    where $1::integer is not null and e.source_bill_id=$1::integer
    union all
    select e.* from pg_temp.trigger_probe_event e
    where $1::integer is null and e.source_bill_id between 0 and 2147483647
  ) event
  $explain$ into v_plan;
  if position('"Index Name": "trigger_probe_event_source_idx"' in v_plan)=0
     or position('"One-Time Filter": "($1 IS NOT NULL)"' in v_plan)=0 then
    raise exception 'event_source_generic_index_missing %',left(v_plan,2600);
  end if;

  execute $explain$EXPLAIN (GENERIC_PLAN TRUE, FORMAT JSON)
  select genome.genome_bill_id from pg_temp.trigger_probe_genome genome
  where $1::integer > 0 and genome.bill_id = (
    select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'
     ||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)
     ||substr(h,18,3)||'-'||substr(h,21,12))::uuid
    from (select encode(extensions.digest(convert_to('docket_room:legiscan:'||$1::integer::text,'UTF8'),'sha256'),'hex') h) hash
  )
  $explain$ into v_plan;
  if position('"Index Name": "trigger_probe_genome_bill_uuid_idx"' in v_plan)=0 then
    raise exception 'genome_bill_uuid_generic_index_missing %',left(v_plan,2600);
  end if;

  raise notice 'trigger_indexed_scopes_generic_plan_pass revision=true event=true genome_uuid=true n=39410';
end;
$verify_generic_index$;
rollback;
