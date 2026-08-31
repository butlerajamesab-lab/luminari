begin

create table if not exists public.source_ingest_chunk_validation (
  ingest_key text not null,
  chunk_index integer not null,
  declared_sha256 text not null,
  computed_sha256 text not null,
  validation_state text not null check (validation_state in ('pass','fail')),
  validated_at timestamptz not null default now(),
  primary key (ingest_key, chunk_index),
  foreign key (ingest_key, chunk_index)
    references public.source_ingest_chunk_receipt(ingest_key, chunk_index)
)

alter table public.source_ingest_chunk_validation enable row level security

create or replace function public.verify_source_ingest_chunk_hash()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_computed text;
begin
  v_computed := encode(extensions.digest(convert_to(new.chunk_base64, 'UTF8'), 'sha256'), 'hex');
  if v_computed <> new.chunk_sha256 then
    raise exception using errcode='22000', message='source_ingest_chunk_hash_mismatch';
  end if;
  return new;
end;
$$

drop trigger if exists source_ingest_chunk_hash_guard on public.source_ingest_chunk_receipt

create trigger source_ingest_chunk_hash_guard
before insert on public.source_ingest_chunk_receipt
for each row execute function public.verify_source_ingest_chunk_hash()

insert into public.source_ingest_chunk_validation (
  ingest_key, chunk_index, declared_sha256, computed_sha256, validation_state
)
select ingest_key,
       chunk_index,
       chunk_sha256,
       encode(extensions.digest(convert_to(chunk_base64, 'UTF8'), 'sha256'), 'hex'),
       case
         when chunk_sha256 = encode(extensions.digest(convert_to(chunk_base64, 'UTF8'), 'sha256'), 'hex')
         then 'pass' else 'fail'
       end
from public.source_ingest_chunk_receipt
on conflict (ingest_key, chunk_index) do nothing

comment on table public.source_ingest_chunk_validation is
  'Immutable validation ledger for transport chunk receipts, including failed control transport attempts.'

commit
