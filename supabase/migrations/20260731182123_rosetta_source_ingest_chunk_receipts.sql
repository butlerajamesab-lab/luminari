begin

create table if not exists public.source_ingest_chunk_receipt (
  ingest_key text not null,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_base64 text not null,
  chunk_sha256 text not null check (chunk_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (ingest_key, chunk_index)
)

alter table public.source_ingest_chunk_receipt enable row level security

create or replace function public.reject_source_ingest_chunk_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode='55000', message='source_ingest_chunk_receipt_is_immutable';
end;
$$

drop trigger if exists source_ingest_chunk_receipt_immutable on public.source_ingest_chunk_receipt

create trigger source_ingest_chunk_receipt_immutable
before update or delete on public.source_ingest_chunk_receipt
for each row execute function public.reject_source_ingest_chunk_mutation()

comment on table public.source_ingest_chunk_receipt is
  'Service-owned immutable transport receipts for bounded source payload chunks. Not a canonical legal output table.'

commit
