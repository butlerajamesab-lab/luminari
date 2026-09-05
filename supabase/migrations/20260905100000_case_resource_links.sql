-- Case-attached resource links: reviewer-authored receipts binding a
-- directory resource to a case.
--
-- A new side table (never a reshape of case_state) so resource references —
-- which are UUIDs or hash-derived gof_ keys, not the numeric ids the
-- existing committed_*_ids arrays carry — get their own hash-keyed,
-- append-only home. Removal is a soft remove (removed_at), never a delete.
-- No RLS change: reads and writes stay server-mediated like the rest of the
-- case layer.

create table if not exists public.case_resource_links (
  id bigint generated always as identity primary key,
  case_id integer not null,
  user_id integer not null,
  resource_ref text not null,
  resource_name text,
  source_lane text,
  link_hash text not null unique,
  created_at bigint not null,
  removed_at bigint
);

comment on table public.case_resource_links is
  'Reviewer-authored links from cases to directory resources. Identity by link_hash (sha256 of case_id + resource_ref). Soft-remove only.';

create index if not exists case_resource_links_case_idx
  on public.case_resource_links (case_id)
  where removed_at is null;
