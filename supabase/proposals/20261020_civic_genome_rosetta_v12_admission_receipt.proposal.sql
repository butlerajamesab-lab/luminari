-- PROPOSAL ONLY — intentionally outside supabase/migrations.
-- DO NOT apply while Civic Genome/Rosetta publication quarantine is closed.
-- Historical admission and rejection must remain independently auditable.
begin;

create table public.civic_genome_rosetta_v12_admission_receipt (
  admission_receipt_id uuid primary key default gen_random_uuid(),
  bill_version_id uuid not null references public.civic_genome_bill_version(bill_version_id),
  contract text not null default 'civic-genome-rosetta-v12-admission-v1'
    check (contract = 'civic-genome-rosetta-v12-admission-v1'),
  source_document_key text not null,
  source_content_id uuid,
  source_document_id bigint not null check (source_document_id > 0),
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  ruleset_version text,
  ruleset_sha256 text check (ruleset_sha256 is null or ruleset_sha256 ~ '^[0-9a-f]{64}
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  certification_sha256 text check (certification_sha256 is null or certification_sha256 ~ '^[0-9a-f]{64}$'),
  admission_state text not null check (admission_state in ('admitted', 'held', 'failed', 'rejected')),
  admitted boolean not null,
  reason text,
  hold_receipt jsonb,
  failure_receipts jsonb not null default '[]'::jsonb check (jsonb_typeof(failure_receipts) = 'array'),
  observed_at timestamptz not null default now(),
  constraint civic_genome_v12_admission_state_consistent check (
    (admitted and admission_state='admitted'
      and reason is null
      and source_content_id is not null
      and ruleset_version is not null and ruleset_sha256 is not null
      and installed_ruleset_sha256 = ruleset_sha256
      and read_contract_sha256 is not null
      and selected_at is not null and output_sha256 is not null
      and certification_sha256 is not null)
    or
    (not admitted and admission_state <> 'admitted'
      and reason is not null and reason ~ '^rosetta_v12_[a-z0-9_]+(:[0-9]+)?$')
  )
);

create index civic_genome_v12_admission_version_time_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (bill_version_id, observed_at desc, admission_receipt_id);

create index civic_genome_v12_admission_exact_source_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (source_content_id, source_content_hash, ruleset_sha256, observed_at desc);

alter table public.civic_genome_rosetta_v12_admission_receipt enable row level security;
revoke all on public.civic_genome_rosetta_v12_admission_receipt from public, anon, authenticated;
grant select, insert on public.civic_genome_rosetta_v12_admission_receipt to service_role;

-- A separate reviewed storage writer and SQL quarantine fence are required.
-- This proposed table is not itself publication authorization.
comment on table public.civic_genome_rosetta_v12_admission_receipt is
  'Proposed append-only observation ledger: rejected, held and failed are never promoted; certification and quarantine still independently gate publication.';

commit;
),
  installed_ruleset_sha256 text check (installed_ruleset_sha256 is null or installed_ruleset_sha256 ~ '^[0-9a-f]{64}
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  certification_sha256 text check (certification_sha256 is null or certification_sha256 ~ '^[0-9a-f]{64}$'),
  admission_state text not null check (admission_state in ('admitted', 'held', 'failed', 'rejected')),
  admitted boolean not null,
  reason text,
  hold_receipt jsonb,
  failure_receipts jsonb not null default '[]'::jsonb check (jsonb_typeof(failure_receipts) = 'array'),
  observed_at timestamptz not null default now(),
  constraint civic_genome_v12_admission_state_consistent check (
    (admitted and admission_state='admitted'
      and reason is null
      and source_content_id is not null
      and ruleset_version is not null and ruleset_sha256 is not null
      and selected_at is not null and output_sha256 is not null
      and certification_sha256 is not null)
    or
    (not admitted and admission_state <> 'admitted'
      and reason is not null and reason ~ '^rosetta_v12_[a-z0-9_]+(:[0-9]+)?$')
  )
);

create index civic_genome_v12_admission_version_time_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (bill_version_id, observed_at desc, admission_receipt_id);

create index civic_genome_v12_admission_exact_source_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (source_content_id, source_content_hash, ruleset_sha256, observed_at desc);

alter table public.civic_genome_rosetta_v12_admission_receipt enable row level security;
revoke all on public.civic_genome_rosetta_v12_admission_receipt from public, anon, authenticated;
grant select, insert on public.civic_genome_rosetta_v12_admission_receipt to service_role;

-- A separate reviewed storage writer and SQL quarantine fence are required.
-- This proposed table is not itself publication authorization.
comment on table public.civic_genome_rosetta_v12_admission_receipt is
  'Proposed append-only observation ledger: rejected, held and failed are never promoted; certification and quarantine still independently gate publication.';

commit;
),
  read_contract_sha256 text check (read_contract_sha256 is null or read_contract_sha256 ~ '^[0-9a-f]{64}
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  certification_sha256 text check (certification_sha256 is null or certification_sha256 ~ '^[0-9a-f]{64}$'),
  admission_state text not null check (admission_state in ('admitted', 'held', 'failed', 'rejected')),
  admitted boolean not null,
  reason text,
  hold_receipt jsonb,
  failure_receipts jsonb not null default '[]'::jsonb check (jsonb_typeof(failure_receipts) = 'array'),
  observed_at timestamptz not null default now(),
  constraint civic_genome_v12_admission_state_consistent check (
    (admitted and admission_state='admitted'
      and reason is null
      and source_content_id is not null
      and ruleset_version is not null and ruleset_sha256 is not null
      and selected_at is not null and output_sha256 is not null
      and certification_sha256 is not null)
    or
    (not admitted and admission_state <> 'admitted'
      and reason is not null and reason ~ '^rosetta_v12_[a-z0-9_]+(:[0-9]+)?$')
  )
);

create index civic_genome_v12_admission_version_time_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (bill_version_id, observed_at desc, admission_receipt_id);

create index civic_genome_v12_admission_exact_source_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (source_content_id, source_content_hash, ruleset_sha256, observed_at desc);

alter table public.civic_genome_rosetta_v12_admission_receipt enable row level security;
revoke all on public.civic_genome_rosetta_v12_admission_receipt from public, anon, authenticated;
grant select, insert on public.civic_genome_rosetta_v12_admission_receipt to service_role;

-- A separate reviewed storage writer and SQL quarantine fence are required.
-- This proposed table is not itself publication authorization.
comment on table public.civic_genome_rosetta_v12_admission_receipt is
  'Proposed append-only observation ledger: rejected, held and failed are never promoted; certification and quarantine still independently gate publication.';

commit;
),
  selected_at timestamptz,
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  certification_sha256 text check (certification_sha256 is null or certification_sha256 ~ '^[0-9a-f]{64}$'),
  admission_state text not null check (admission_state in ('admitted', 'held', 'failed', 'rejected')),
  admitted boolean not null,
  reason text,
  hold_receipt jsonb,
  failure_receipts jsonb not null default '[]'::jsonb check (jsonb_typeof(failure_receipts) = 'array'),
  observed_at timestamptz not null default now(),
  constraint civic_genome_v12_admission_state_consistent check (
    (admitted and admission_state='admitted'
      and reason is null
      and source_content_id is not null
      and ruleset_version is not null and ruleset_sha256 is not null
      and selected_at is not null and output_sha256 is not null
      and certification_sha256 is not null)
    or
    (not admitted and admission_state <> 'admitted'
      and reason is not null and reason ~ '^rosetta_v12_[a-z0-9_]+(:[0-9]+)?$')
  )
);

create index civic_genome_v12_admission_version_time_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (bill_version_id, observed_at desc, admission_receipt_id);

create index civic_genome_v12_admission_exact_source_idx
  on public.civic_genome_rosetta_v12_admission_receipt
  (source_content_id, source_content_hash, ruleset_sha256, observed_at desc);

alter table public.civic_genome_rosetta_v12_admission_receipt enable row level security;
revoke all on public.civic_genome_rosetta_v12_admission_receipt from public, anon, authenticated;
grant select, insert on public.civic_genome_rosetta_v12_admission_receipt to service_role;

-- A separate reviewed storage writer and SQL quarantine fence are required.
-- This proposed table is not itself publication authorization.
comment on table public.civic_genome_rosetta_v12_admission_receipt is
  'Proposed append-only observation ledger: rejected, held and failed are never promoted; certification and quarantine still independently gate publication.';

commit;
