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
    'run_status = ''clean'',',
    'run_status = ''completed'','
  );

  if v_changed = v_sql
     or position('run_status = ''completed'',' in v_changed) = 0
     or position('status = ''clean'',' in v_changed) = 0 then
    raise exception 'Rosetta 2.2 run/manifest status correction failed';
  end if;

  execute v_changed;
end;
$migration$

comment on function public.rosetta_v22_finalize_extraction(integer, text, jsonb, jsonb) is
  'Rosetta 2.2 exact-source finalizer. Persists extraction manifests as clean, extraction runs as completed, exact definition punctuation, and source-stated amendment operations without applying legal effect.'

commit
