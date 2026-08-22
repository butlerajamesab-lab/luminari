do $migration$
begin
  create type public.lighthouse_suggestions_suggestion_status_enum
    as enum ('pending', 'reviewed', 'accepted', 'implemented', 'declined');
exception
  when duplicate_object then null;
end
$migration$;

create table if not exists public.lighthouse_suggestions (
  id serial primary key,
  "userId" integer not null,
  content text not null,
  "suggestionStatus" public.lighthouse_suggestions_suggestion_status_enum not null default 'pending',
  votes integer not null default 0,
  "adminNote" text,
  "createdAt" bigint not null,
  "updatedAt" bigint not null
);

create index if not exists idx_lh_suggestion_user
  on public.lighthouse_suggestions ("userId");
create index if not exists idx_lh_suggestion_status
  on public.lighthouse_suggestions ("suggestionStatus");
create index if not exists idx_lh_suggestion_votes
  on public.lighthouse_suggestions (votes);

create table if not exists public.lighthouse_suggestion_votes (
  id serial primary key,
  "suggestionId" integer not null,
  "userId" integer not null,
  "createdAt" bigint not null
);

create unique index if not exists idx_lh_vote_unique
  on public.lighthouse_suggestion_votes ("suggestionId", "userId");

alter table public.lighthouse_suggestions enable row level security;
alter table public.lighthouse_suggestion_votes enable row level security;

revoke all on table public.lighthouse_suggestions from public, anon, authenticated;
revoke all on table public.lighthouse_suggestion_votes from public, anon, authenticated;
revoke all on sequence public.lighthouse_suggestions_id_seq from public, anon, authenticated;
revoke all on sequence public.lighthouse_suggestion_votes_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.lighthouse_suggestions to service_role;
grant select, insert, update, delete on table public.lighthouse_suggestion_votes to service_role;
grant usage, select on sequence public.lighthouse_suggestions_id_seq to service_role;
grant usage, select on sequence public.lighthouse_suggestion_votes_id_seq to service_role;

comment on table public.lighthouse_suggestions is
  'Existing Lighthouse Suggestion Board records; server-owned and fail-closed to public clients.';
comment on table public.lighthouse_suggestion_votes is
  'Existing Lighthouse Suggestion Board vote ledger; server-owned and fail-closed to public clients.';
