-- ============================================================================
-- Migration 99 -- cleanup / rollback. Removes ONLY the candidate namespaces
-- created by this package (rosetta_v2513, rosetta_replay). Never touches
-- public.* or any production object. Safe to run repeatedly.
-- ============================================================================
do $$
begin
  if current_database() is null then
    raise exception 'unreachable';
  end if;
  -- refuse to run if pointed at a database that has production rosetta tables
  -- with data in public: this script must only ever run in the disposable
  -- validation environment.
  if exists (select 1 from pg_tables where schemaname='public' and tablename='extraction_run') then
    raise exception 'refusing cleanup: public.extraction_run exists -- this is not the disposable validation environment'
      using errcode = 'raise_exception';
  end if;
end $$;

drop schema if exists rosetta_v2513 cascade;
drop schema if exists rosetta_replay cascade;
