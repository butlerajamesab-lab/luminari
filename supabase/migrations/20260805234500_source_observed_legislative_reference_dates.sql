begin;

create table if not exists public.docket_source_reference_date_receipt (
  source_document_key text primary key
    references public.docket_bill_source_document(source_document_key)
    on delete cascade,
  provider_hash text not null
    check (provider_hash ~ '^[0-9a-f]{32}$'),
  source_content_hash text not null
    check (source_content_hash ~ '^[0-9a-f]{64}$'),
  reference_date date not null,
  source_observed_marker text not null,
  derivation_rule_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.docket_source_reference_date_receipt is
  'Deterministic receipts for official-source dates used when the upstream provider omits its document date. The provider payload remains preserved separately.';

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_definition;

  if v_definition like
     '%provider_date = coalesce(excluded.provider_date, docket_bill_source_document.provider_date),%' then
    -- The production function already preserves an observed reference date when
    -- the provider omits its date. Treat the migration as an idempotent replay.
    null;
  elsif v_definition like '%provider_date = excluded.provider_date,%' then
    v_updated := replace(
      v_definition,
      'provider_date = excluded.provider_date,',
      'provider_date = coalesce(excluded.provider_date, docket_bill_source_document.provider_date),'
    );

    if v_updated = v_definition then
      raise exception 'source_reference_date_registration_guard_not_replaced';
    end if;

    execute v_updated;
  else
    raise exception 'source_reference_date_expected_registration_function_missing';
  end if;
end;
$migration$;

insert into public.docket_source_reference_date_receipt (
  source_document_key,
  provider_hash,
  source_content_hash,
  reference_date,
  source_observed_marker,
  derivation_rule_version
)
select
  candidate.source_document_key,
  candidate.provider_hash,
  candidate.source_content_hash,
  candidate.reference_date,
  candidate.source_observed_marker,
  candidate.derivation_rule_version
from (values
  (
    'text:2064783:3298849',
    'a0c94db2b4b86f2fee3a2be5a50c8a38',
    'be595f065c321d088eac0152ed41773b5e2e2558723da739f78d57e320a0e3e8',
    date '2026-01-12',
    'Read first time 01/12/26.',
    'official-source-status-date-v1'
  ),
  (
    'amendment:2064783:274016',
    '36d9eebc71c99c8f5cec2f30144a0389',
    '8dffd236cada052b66198c332fc2242132ee27626351504257ce787595754fe7',
    date '2026-02-17',
    'WITHDRAWN 02/17/2026',
    'official-source-status-date-v1'
  ),
  (
    'amendment:2064783:274666',
    '36a29f21d34df486f73e934ebb5aa9a4',
    '8ee6375a1969d4e1d133e5f26dbc6aca5f95c65452e4ed9da78f761e0f871d81',
    date '2026-02-17',
    'ADOPTED AS AMENDED 02/17/2026',
    'official-source-status-date-v1'
  ),
  (
    'amendment:2064783:274939',
    '9918b3fade2bfa7612e0e7ec857ed195',
    'd75861aae4deb6299c09806a1b685c318aed6050bff6c2270f51d52bde0c2757',
    date '2026-02-17',
    'WITHDRAWN 02/17/2026',
    'official-source-status-date-v1'
  )
) as candidate(
  source_document_key,
  provider_hash,
  source_content_hash,
  reference_date,
  source_observed_marker,
  derivation_rule_version
)
join public.docket_bill_source_document document
  on document.source_document_key = candidate.source_document_key
on conflict (source_document_key) do update
set provider_hash = excluded.provider_hash,
    source_content_hash = excluded.source_content_hash,
    reference_date = excluded.reference_date,
    source_observed_marker = excluded.source_observed_marker,
    derivation_rule_version = excluded.derivation_rule_version,
    updated_at = now();

do $validation$
declare
  v_conflicts integer;
begin
  select count(*)::integer
    into v_conflicts
  from public.docket_source_reference_date_receipt receipt
  join public.docket_bill_source_document document
    on document.source_document_key = receipt.source_document_key
  where document.provider_hash is distinct from receipt.provider_hash;

  if v_conflicts > 0 then
    raise exception using
      errcode = '22000',
      message = 'source_reference_date_provider_identity_mismatch',
      detail = v_conflicts::text;
  end if;
end;
$validation$;

update public.docket_bill_source_document document
   set provider_date = receipt.reference_date,
       updated_at = now()
  from public.docket_source_reference_date_receipt receipt
 where receipt.source_document_key = document.source_document_key
   and document.provider_hash = receipt.provider_hash
   and document.provider_date is distinct from receipt.reference_date;

commit;
