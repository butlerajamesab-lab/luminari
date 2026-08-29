-- Civic Map view security boundary.
-- Preserve public map behavior while enforcing the caller's table grants and RLS.

begin
alter view public.v_map_layer1_light set (security_invoker = true)
alter view public.v_map_layer2_detail set (security_invoker = true)
comment on view public.v_map_layer1_light is
  'Layer-one Civic Map projection. Runs with invoker privileges so normalized civic-resource RLS and grants remain authoritative.'
comment on view public.v_map_layer2_detail is
  'Layer-two Civic Map detail projection. Runs with invoker privileges so normalized civic-resource RLS and grants remain authoritative.'
do $civicmap_security_contract$
declare
  layer1_options text[];
  layer2_options text[];
begin
  select c.reloptions
    into layer1_options
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_map_layer1_light'
    and c.relkind = 'v';

  select c.reloptions
    into layer2_options
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_map_layer2_detail'
    and c.relkind = 'v';

  if not coalesce('security_invoker=true' = any(layer1_options), false) then
    raise exception 'civicmap_layer1_security_invoker_missing';
  end if;

  if not coalesce('security_invoker=true' = any(layer2_options), false) then
    raise exception 'civicmap_layer2_security_invoker_missing';
  end if;
end;
$civicmap_security_contract$
commit
