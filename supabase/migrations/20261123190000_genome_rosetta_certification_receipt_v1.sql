-- Independent certification receipts for the Genome admission contract.
-- Added layer: the publication quarantine is unchanged.
-- Append-only: updates and deletes are refused by trigger, for every role.

create table if not exists public.civic_genome_rosetta_certification_receipt (
  receipt_id bigint generated always as identity primary key,
  source_content_id uuid not null,
  source_document_id bigint not null check (source_document_id > 0),
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  ruleset_version text not null check (length(ruleset_version) > 0),
  ruleset_sha256 text not null check (ruleset_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  certifier text not null check (certifier = 'lighthouse-independent-recompute-v1'),
  certification_sha256 text not null check (certification_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_json jsonb not null,
  certified_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (source_content_id, output_sha256, certifier)
);

comment on table public.civic_genome_rosetta_certification_receipt is
  'Append-only. Lighthouse recomputation of a Rosetta result against its exact source bytes. Not publication authority by itself.';

create or replace function public.civic_genome_rosetta_certification_receipt_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'civic_genome_rosetta_certification_receipt is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists civic_genome_rosetta_certification_receipt_append_only
  on public.civic_genome_rosetta_certification_receipt;
create trigger civic_genome_rosetta_certification_receipt_append_only
  before update or delete on public.civic_genome_rosetta_certification_receipt
  for each row execute function public.civic_genome_rosetta_certification_receipt_refuse_change();

drop trigger if exists civic_genome_rosetta_certification_receipt_no_truncate
  on public.civic_genome_rosetta_certification_receipt;
create trigger civic_genome_rosetta_certification_receipt_no_truncate
  before truncate on public.civic_genome_rosetta_certification_receipt
  for each statement execute function public.civic_genome_rosetta_certification_receipt_refuse_change();

alter table public.civic_genome_rosetta_certification_receipt enable row level security;
revoke all on public.civic_genome_rosetta_certification_receipt from anon, authenticated;
