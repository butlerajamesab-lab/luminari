create table if not exists public.governance_snapshots (
  id serial primary key,
  snapshot_at bigint not null,
  up_to_seq_no integer not null,
  hash_chain_root text not null,
  entry_count integer not null check (entry_count >= 0),
  signature text not null,
  signed_by text not null,
  signature_algorithm text not null default 'Ed25519',
  created_at bigint not null
);

create unique index if not exists uq_governance_snapshots_chain_root
  on public.governance_snapshots (up_to_seq_no, hash_chain_root);

create index if not exists idx_governance_snapshots_created_at
  on public.governance_snapshots (created_at desc);

comment on table public.governance_snapshots is
  'Append-only cryptographic checkpoints for the constitutional governance log.';
