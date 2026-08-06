-- Reconcile the existing Lighthouse workspace projections with their live
-- snake_case PostgreSQL contract. This migration is additive and preserves the
-- current React/tRPC response shapes through Drizzle aliases.

alter table public.share_links
  add column if not exists label varchar(256),
  add column if not exists permissions text not null default 'read_only',
  add column if not exists expires_at bigint not null
    default ((extract(epoch from (now() + interval '30 days')) * 1000)::bigint),
  add column if not exists revoked_at bigint,
  add column if not exists last_accessed_at bigint,
  add column if not exists access_count integer not null default 0,
  add column if not exists created_at bigint not null
    default ((extract(epoch from now()) * 1000)::bigint);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.share_links'::regclass
       and conname = 'share_links_permissions_check'
  ) then
    alter table public.share_links
      add constraint share_links_permissions_check
      check (permissions in ('read_only', 'read_export'));
  end if;
end
$$;

create unique index if not exists idx_share_token
  on public.share_links (token)
  where token is not null;
create index if not exists idx_share_case
  on public.share_links (case_id);
create index if not exists idx_share_created_by
  on public.share_links (created_by);
create index if not exists idx_share_expires
  on public.share_links (expires_at);

alter table public.share_links enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.share_links from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.share_links from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.share_links to service_role;
  end if;
end
$$;
