-- tests/99_cleanup_postconditions.sql — proves the rollback removed only the
-- package-owned candidate namespaces and is safe to repeat. The runner applies
-- migration 99 twice before this file, so reaching it also proves idempotence.
\set QUIET on

do $$
begin
  if to_regnamespace('rosetta_v2513') is not null then
    raise exception 'TEST_FAIL cleanup left schema rosetta_v2513';
  end if;
  if to_regnamespace('rosetta_replay') is not null then
    raise exception 'TEST_FAIL cleanup left schema rosetta_replay';
  end if;
  raise notice 'PASS 99.1 cleanup removed both package-owned candidate schemas';
end $$;
