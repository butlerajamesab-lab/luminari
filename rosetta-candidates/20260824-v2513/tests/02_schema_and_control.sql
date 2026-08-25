-- tests/02_schema_and_control.sql — candidate schema lockdown, control fidelity,
-- nonpublication, closure hashing
\set QUIET on

-- 1. control closure keeps 2.5.11 identity (no identity swap)
do $$
declare n integer;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='rosetta_v2513' and p.proname like 'ctl\_%' escape '\'
    and pg_get_functiondef(p.oid) like '%rosetta-v3-deterministic-sql-2.5.11%';
  if n = 0 then raise exception 'TEST_FAIL control lost 2.5.11 identity'; end if;
  raise notice 'PASS 02.1 control identity preserved (% functions)', n;
end $$;

-- 2. closure hashing is deterministic and lane-distinct
do $$
declare h1 text; h2 text; hc1 text;
begin
  select encode(extensions.digest(string_agg(pg_get_functiondef(p.oid), chr(10) order by p.proname),'sha256'),'hex')
    into h1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='rosetta_v2513' and p.proname like 'ctl\_%' escape '\';
  select encode(extensions.digest(string_agg(pg_get_functiondef(p.oid), chr(10) order by p.proname),'sha256'),'hex')
    into h2 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='rosetta_v2513' and p.proname like 'ctl\_%' escape '\';
  if h1 is distinct from h2 or h1 is null then raise exception 'TEST_FAIL closure hash unstable'; end if;
  select encode(extensions.digest(string_agg(pg_get_functiondef(p.oid), chr(10) order by p.proname),'sha256'),'hex')
    into hc1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='rosetta_v2513' and p.proname like 'c1\_%' escape '\';
  if hc1 = h1 then raise exception 'TEST_FAIL lane c1 hash identical to control'; end if;
  raise notice 'PASS 02.2 closure hashing deterministic, lanes distinct';
end $$;

-- 3. candidate nonpublication: no publication machinery in candidate schema
do $$
begin
  if exists (select 1 from pg_views where schemaname='rosetta_v2513'
             and viewname='v_civic_genome_law_view_v1') then
    raise exception 'TEST_FAIL publication view exists in candidate schema';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
             where ns.nspname='rosetta_v2513'
               and p.proname like '%rosetta_is_current_publishable_run_v1%') then
    raise exception 'TEST_FAIL publishable-run function exists in candidate schema';
  end if;
  raise notice 'PASS 02.3 candidate structurally unable to publish';
end $$;

-- 4. lockdown: anon cannot write candidate tables.  Candidate rows are an
--    internal review substrate, so SELECT may also be denied; the test must
--    not weaken that stricter least-privilege posture.
do $$
declare ins_ok boolean; upd_ok boolean; sel_ok boolean;
begin
  select has_table_privilege('anon','rosetta_v2513.extraction_run','INSERT'),
         has_table_privilege('anon','rosetta_v2513.extraction_run','UPDATE'),
         has_table_privilege('anon','rosetta_v2513.extraction_run','SELECT')
    into ins_ok, upd_ok, sel_ok;
  if ins_ok or upd_ok then
    raise exception 'TEST_FAIL grant posture ins=% upd=% sel=%', ins_ok, upd_ok, sel_ok;
  end if;
  if exists (select 1 from pg_tables t join pg_roles r on true
             where t.schemaname='rosetta_v2513' and r.rolname in ('anon','authenticated','postgres')
               and r.rolname <> 'postgres'
               and has_table_privilege(r.rolname, t.schemaname||'.'||t.tablename,'INSERT')) then
    raise exception 'TEST_FAIL some candidate table is writable by non-owner role';
  end if;
  raise notice 'PASS 02.4 lockdown grants verified (anon select=%)', sel_ok;
end $$;

-- 5. control vs lane C1 diverge only on the measured bound: actor of 200 chars
--    parses under both; a pre-modal segment above the measured bound (1024;
--    live corpus 2026-08-24: p999=571.26, max=6566, n=156869) blocks only in c1
do $$
declare v_ctl record; v_c1 record; long_actor text; ok_clause text;
begin
  ok_clause := 'The city clerk shall file the report.';
  select * into v_ctl from rosetta_v2513.ctl_rosetta_v25_modal_and_actor(ok_clause);
  select * into v_c1 from rosetta_v2513.c1_rosetta_v25_modal_and_actor(ok_clause);
  if v_ctl.actor is distinct from v_c1.actor or lower(v_ctl.actor) <> 'the city clerk' then
    raise exception 'TEST_FAIL control/c1 divergence on ordinary clause: ctl=%', v_ctl.actor;
  end if;
  long_actor := 'The ' || repeat('very ', 210) || 'diligent city clerk shall file the report.';
  begin
    perform rosetta_v2513.c1_rosetta_v25_modal_and_actor(long_actor);
    raise exception 'TEST_FAIL c1 overflow not blocking';
  exception when sqlstate 'P1A01' then null;
  end;
  -- control is unchanged: it still parses without the measured bound
  perform rosetta_v2513.ctl_rosetta_v25_modal_and_actor(long_actor);
  raise notice 'PASS 02.5 C1 measured bound: >1024-char pre-modal segment blocks only in lane c1';
end $$;
