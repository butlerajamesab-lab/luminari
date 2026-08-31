begin

do $migration$
declare
  v_sql text;
  v_changed text;
begin
  select pg_get_functiondef(
    'public.rosetta_v22_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure
  ) into v_sql;

  v_changed := replace(
    v_sql,
    'status = ''completed'',',
    'status = ''clean'','
  );

  if v_changed = v_sql
     or position('status = ''clean'',' in v_changed) = 0 then
    raise exception 'Rosetta 2.2 manifest status correction failed';
  end if;

  execute v_changed;
end;
$migration$

comment on function public.rosetta_v22_finalize_extraction(integer, text, jsonb, jsonb) is
  'Rosetta 2.2 exact-source finalizer. Persists the canonical manifest status as clean, preserves exact definition punctuation, and records source-stated amendment operations without applying legal effect.'

commit
