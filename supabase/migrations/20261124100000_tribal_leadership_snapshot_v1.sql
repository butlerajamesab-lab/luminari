-- Tribal leadership snapshots: each pull of the BIA Tribal Leaders Directory
-- is kept as its own dated snapshot, so a new pull never erases who held
-- office before. Rows are keyed by the nation's full name: BIA GlobalIDs are
-- service-assigned and change between exports (Agdaagux was 2f4a48ba-... on
-- 2026-10-28 and 007c512d-... in the 2026-11-24 export).
-- Additive only; public.tribal_leaders is left as it is; nothing deleted.
create table if not exists public.tribal_leadership_snapshot_v1 (
  snapshot_id text not null,
  tribe_full_name text not null,
  bia_global_id text,
  leader_full_name text,
  title text,
  date_elected text,
  next_election text,
  record jsonb not null,
  source text not null,
  source_file_sha256 text,
  captured_date text not null,
  recorded_at timestamptz not null default now(),
  primary key (snapshot_id, tribe_full_name)
);
create index if not exists idx_tribal_leadership_snapshot_v1_tribe
  on public.tribal_leadership_snapshot_v1 (tribe_full_name, captured_date desc);

alter table public.tribal_leadership_snapshot_v1 enable row level security;
revoke all on public.tribal_leadership_snapshot_v1 from public, anon, authenticated, service_role;
grant select, insert on public.tribal_leadership_snapshot_v1 to service_role;

-- The 2026-10-28 pull, carried over verbatim from public.tribal_leaders.
insert into public.tribal_leadership_snapshot_v1 (
  snapshot_id, tribe_full_name, bia_global_id, leader_full_name, title,
  date_elected, next_election, record, source, source_file_sha256, captured_date
)
select
  'bia_tld_2026-10-28',
  t.tribe_full_name,
  t.member_key,
  t.full_name,
  t.title,
  t.date_elected,
  t.next_election,
  to_jsonb(t),
  t.source,
  null,
  t.fetched_date
from public.tribal_leaders t
on conflict (snapshot_id, tribe_full_name) do nothing;
