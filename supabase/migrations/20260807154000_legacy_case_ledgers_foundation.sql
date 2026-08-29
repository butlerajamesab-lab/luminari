begin;

-- The sequence-alignment migrations operate on two legacy server-owned
-- ledgers that existed in production but had no creating DDL in source control.
create table if not exists public.corpus_snapshots (
  id serial primary key,
  case_id integer,
  version integer,
  engine_version text,
  document_ids text,
  document_hashes text,
  created_at bigint,
  sealed_at text,
  snapshot_status text,
  signature text,
  signature_algorithm text,
  public_key_fingerprint text
);

create table if not exists public.audit_trail (
  id serial primary key,
  case_id integer,
  user_id integer,
  action text,
  target_type text,
  target_id integer,
  details text,
  hash text,
  created_at bigint
);

do $security$
declare
  target text;
begin
  foreach target in array array['corpus_snapshots', 'audit_trail'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      target
    );
    execute format('grant all on table public.%I to service_role', target);
  end loop;
end
$security$;

revoke all on sequence public.corpus_snapshots_id_seq
  from public, anon, authenticated;
revoke all on sequence public.audit_trail_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.corpus_snapshots_id_seq to service_role;
grant usage, select on sequence public.audit_trail_id_seq to service_role;

commit;
