begin

do $$
declare
  v_table text;
begin
  foreach v_table in array array['users', 'posts', 'comments']
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'expected preserved template table public.% is missing', v_table;
    end if;
  end loop;
end;
$$

alter table public.users enable row level security

alter table public.posts enable row level security

alter table public.comments enable row level security

revoke all on table public.users from public, anon, authenticated

revoke all on table public.posts from public, anon, authenticated

revoke all on table public.comments from public, anon, authenticated

grant select, insert, update, delete on table public.users to service_role

grant select, insert, update, delete on table public.posts to service_role

grant select, insert, update, delete on table public.comments to service_role

comment on table public.users is
  'Preserved non-Rosetta template fixture. Not an operator, source, actor, or application user registry. Service-role only; no browser policies.'

comment on table public.posts is
  'Preserved non-Rosetta template fixture. Not a legal source, Rosetta output, finding, or public content surface. Service-role only; no browser policies.'

comment on table public.comments is
  'Preserved non-Rosetta template fixture. Not evidence, annotation, verification, or Rosetta provenance. Service-role only; no browser policies.'

commit
