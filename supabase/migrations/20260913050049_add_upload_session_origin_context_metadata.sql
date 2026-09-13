alter table public.upload_sessions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.upload_sessions.metadata is
  'Optional upload-session metadata, including case-surface origin context for evidence and context additions routed through the authenticated upload entrypoint.';
