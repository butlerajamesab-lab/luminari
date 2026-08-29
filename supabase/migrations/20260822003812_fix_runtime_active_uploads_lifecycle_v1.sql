-- Keep the operational upload projection aligned with the existing upload
-- lifecycle. This is read-model-only: it does not mutate evidence, cases, or
-- upload-session records.

create or replace view public.v_runtime_active_uploads
with (security_invoker = true)
as
select
  id,
  case_id,
  user_id,
  total_files,
  completed_files,
  failed_files,
  duplicate_files,
  session_status,
  created_at,
  updated_at,
  (
    session_status in ('uploading', 'processing')
    and updated_at >= ((extract(epoch from now()) * 1000)::bigint - 3600000)
  ) as actively_processing
from public.upload_sessions;

comment on view public.v_runtime_active_uploads is
  'Security-invoker operational projection of upload sessions. Only upload/processing sessions updated in the last 60 minutes are active; terminal and stale sessions remain visible but inactive.';
