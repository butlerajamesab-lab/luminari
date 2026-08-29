begin
alter table public.docket_source_reference_date_receipt
  enable row level security
revoke all on table public.docket_source_reference_date_receipt
  from public, anon, authenticated
comment on table public.docket_source_reference_date_receipt is
  'Private deterministic receipts for official-source dates used when the upstream provider omits its document date. Direct anon and authenticated access is denied; governed backend operations retain service-role access.'
commit
