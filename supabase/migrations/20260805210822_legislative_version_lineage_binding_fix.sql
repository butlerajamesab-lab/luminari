begin;

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
    replace(
      v_sql,
      'predecessor.genome_bill_id = version.genome_bill_id',
      'predecessor.genome_bill_id = v_genome_bill_id'
    ),
    'base.genome_bill_id = version.genome_bill_id',
    'base.genome_bill_id = v_genome_bill_id'
  );

  if v_changed <> v_sql then
    execute v_changed;
  end if;

  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_sql;

  if position('predecessor.genome_bill_id = v_genome_bill_id' in v_sql) = 0
     or position('base.genome_bill_id = v_genome_bill_id' in v_sql) = 0 then
    raise exception 'Legislative-version lineage binding remains target-row dependent';
  end if;
end;
$migration$;

comment on function public.register_docket_legislative_version_spine(integer, boolean) is
  'Registers every provider-declared bill text and amendment, preserves immutable observations, binds exact source documents to one Civic Genome bill identity, and resolves predecessor/base versions using that explicit Genome identity rather than an UPDATE target alias.';

commit;
