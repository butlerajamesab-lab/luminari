-- Deleting historical/superseded evidence does not change the active source
-- set and must not hide a still-valid governed projection. Keep the physical
-- DELETE invalidation path fail-closed only for documents that were active at
-- deletion time.

drop trigger if exists documents_invalidate_live_upload_intake_delete_v1_trg on public.documents;
create trigger documents_invalidate_live_upload_intake_delete_v1_trg
after delete on public.documents
for each row
when (
  old.case_id is not null
  and coalesce(old.document_resolution, 'active') = 'active'
)
execute function public.promote_live_upload_intake_authority_trigger_v1();

comment on trigger documents_invalidate_live_upload_intake_delete_v1_trg on public.documents is
  'Invalidates the authoritative live-upload Intake projection only when deleting an active Lighthouse document changes the active evidence set.';
