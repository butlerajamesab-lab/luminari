-- A physical document deletion changes the active evidence set just as surely
-- as an upload or supersession. Reuse the sole-authority promotion lock and
-- invalidation path so a completed session cannot continue projecting results
-- derived from a document that no longer exists.

create or replace function public.promote_live_upload_intake_authority_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.promote_live_upload_intake_authority_v1(old.case_id, true);
    return old;
  end if;

  perform public.promote_live_upload_intake_authority_v1(new.case_id, true);
  return new;
end
$$;

drop trigger if exists documents_invalidate_live_upload_intake_delete_v1_trg on public.documents;
create trigger documents_invalidate_live_upload_intake_delete_v1_trg
after delete on public.documents
for each row
when (old.case_id is not null)
execute function public.promote_live_upload_intake_authority_trigger_v1();

revoke all on function public.promote_live_upload_intake_authority_trigger_v1()
  from public, anon, authenticated;

comment on trigger documents_invalidate_live_upload_intake_delete_v1_trg on public.documents is
  'Invalidates the authoritative live-upload Intake projection whenever deleting a Lighthouse document changes the active evidence set.';
