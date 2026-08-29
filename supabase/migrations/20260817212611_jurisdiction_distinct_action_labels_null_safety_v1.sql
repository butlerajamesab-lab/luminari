-- Preserve an action label when a future reviewed record has not yet resolved
-- a state code. The preceding display migration encountered no such live rows,
-- but NULL must never erase a derived projection name.

begin;

create or replace function public.luminari_action_display_label_v1(
  p_action_label text,
  p_state_code text
)
returns text
language sql
immutable
called on null input
parallel safe
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
  select case
    when nullif(btrim(p_action_label), '') is null then p_action_label
    when nullif(btrim(p_state_code), '') is null then btrim(p_action_label)
    when upper(btrim(p_state_code)) = 'US' then btrim(p_action_label)
    when lower(right(
      btrim(p_action_label),
      length(btrim(p_state_code)) + 3
    )) = lower(' — ' || btrim(p_state_code)) then btrim(p_action_label)
    else btrim(p_action_label) || ' — ' || upper(btrim(p_state_code))
  end;
$function$;

revoke all on function public.luminari_action_display_label_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_display_label_v1(text, text)
  to service_role;

comment on function public.luminari_action_display_label_v1(text, text) is
  'NULL-safe, idempotent person-facing action label: preserves unresolved and US labels and appends a non-US jurisdiction code without changing identity.';

commit;
