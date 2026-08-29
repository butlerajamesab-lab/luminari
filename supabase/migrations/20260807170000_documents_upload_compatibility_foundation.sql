-- Reconcile the original source-controlled document table with the upload
-- contract that was introduced later against the live production schema.
--
-- Fresh databases begin with `storage_path`; the live application and the
-- downstream intake-spine migrations use `s3_key` plus lifecycle metadata.
-- Keep both storage names during the compatibility window and backfill only
-- the missing live key.  No document bytes or receipt identities are changed.

alter table public.documents
  add column if not exists s3_key text,
  add column if not exists s3_url text,
  add column if not exists error_message text,
  add column if not exists retry_count integer,
  add column if not exists duration_seconds text,
  add column if not exists document_purpose text,
  add column if not exists ai_metadata text,
  add column if not exists snapshot_id integer,
  add column if not exists document_resolution text,
  add column if not exists replaced_by_document_id text,
  add column if not exists resolution_reason text,
  add column if not exists storage_path varchar(512);

update public.documents
   set s3_key = storage_path
 where s3_key is null
   and nullif(btrim(storage_path), '') is not null;

comment on column public.documents.storage_path is
  'Legacy source-controlled storage path retained during the s3_key compatibility window.';

comment on column public.documents.s3_key is
  'Canonical Lighthouse private-object key used by upload and intake-spine runtimes.';
