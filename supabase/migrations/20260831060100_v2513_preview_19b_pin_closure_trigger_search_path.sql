
create or replace function rosetta_replay.reject_closure_identity_mutation()
returns trigger language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
begin
  raise exception 'installed_closure_identity_is_immutable'
    using errcode='raise_exception';
end;
$fn$;
revoke all on function rosetta_replay.reject_closure_identity_mutation()
  from public,anon,authenticated;
