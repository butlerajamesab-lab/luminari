begin;

set local lock_timeout = '5s';

set local statement_timeout = '120s';

create or replace function public.luminari_reject_sealed_intake_layer_run_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.is_sealed then
    raise exception using
      errcode = '55000',
      message = format(
        'sealed intake layer run %s is immutable (%s rejected)',
        old.layer_run_id,
        tg_op
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
  from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
      from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
      from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.luminari_reject_sealed_intake_layer_run_mutation()
      to service_role;
  end if;
end
$acl$;

drop trigger if exists trg_intake_layer_runs_reject_sealed_mutation
  on public.intake_layer_runs;

create trigger trg_intake_layer_runs_reject_sealed_mutation
before update or delete on public.intake_layer_runs
for each row
execute function public.luminari_reject_sealed_intake_layer_run_mutation();

comment on function public.luminari_reject_sealed_intake_layer_run_mutation() is
  'Rejects UPDATE or DELETE of sealed Universal Intake Spine layer runs; supersession requires insertion.';

commit;
