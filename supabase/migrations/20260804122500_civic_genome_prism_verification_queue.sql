create extension if not exists pgcrypto with schema extensions;

create table if not exists public.civic_genome_prism_verification_queue (
  queue_id uuid primary key default gen_random_uuid(),
  assembly_run_id uuid not null
    references public.civic_genome_assembly_run(assembly_run_id),
  genome_bill_id uuid not null
    references public.civic_genome_bill(genome_bill_id),
  prism_rule_set_id text not null,
  prism_rule_set_version text not null,
  queue_state text not null default 'eligible' check (queue_state in (
    'eligible',
    'submitted',
    'receipt_partial',
    'completed',
    'degraded',
    'permanent_failure',
    'superseded'
  )),
  expected_trait_count integer not null check (expected_trait_count > 0),
  receipt_count integer not null default 0 check (receipt_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  eligible_at timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_failure_class text,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assembly_run_id, prism_rule_set_id, prism_rule_set_version),
  check (receipt_count <= expected_trait_count),
  check (
    (locked_at is null and locked_by is null)
    or (locked_at is not null and locked_by is not null)
  ),
  check (
    queue_state <> 'completed'
    or (
      receipt_count = expected_trait_count
      and completed_at is not null
      and locked_at is null
      and locked_by is null
    )
  )
);

create index if not exists civic_genome_prism_queue_claim_idx
  on public.civic_genome_prism_verification_queue (
    queue_state,
    next_attempt_at,
    eligible_at,
    queue_id
  );

create index if not exists civic_genome_prism_queue_bill_idx
  on public.civic_genome_prism_verification_queue (
    genome_bill_id,
    eligible_at desc
  );

insert into public.civic_genome_prism_verification_queue (
  assembly_run_id,
  genome_bill_id,
  prism_rule_set_id,
  prism_rule_set_version,
  queue_state,
  expected_trait_count,
  receipt_count,
  eligible_at,
  next_attempt_at,
  completed_at
)
select
  assembly.assembly_run_id,
  assembly.genome_bill_id,
  'prism-rosetta-structural-binding',
  '1.0.1',
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then 'completed'
    when coalesce(binding.receipt_count, 0) > 0 then 'receipt_partial'
    else 'eligible'
  end,
  assembly.trait_count,
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then verification.receipt_count
    else coalesce(binding.receipt_count, 0)
  end,
  coalesce(assembly.completed_at, assembly.created_at, now()),
  now(),
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then verification.completed_at
    else null
  end
from public.civic_genome_assembly_run assembly
left join lateral (
  select count(*)::integer as receipt_count
    from public.civic_genome_prism_verification_binding receipt
   where receipt.assembly_run_id = assembly.assembly_run_id
     and receipt.prism_rule_set_id = 'prism-rosetta-structural-binding'
     and receipt.prism_rule_set_version = '1.0.1'
) binding on true
left join public.civic_genome_prism_verification_run verification
  on verification.assembly_run_id = assembly.assembly_run_id
 and verification.prism_rule_set_id = 'prism-rosetta-structural-binding'
 and verification.prism_rule_set_version = '1.0.1'
where assembly.run_status = 'completed'
  and assembly.verification_state = 'complete'
  and assembly.trait_count > 0
on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
  do nothing;

create or replace view public.v_civic_genome_prism_verification_queue_status
with (security_invoker = true)
as
select
  queue.queue_id,
  queue.assembly_run_id,
  queue.genome_bill_id,
  bill.state_code,
  bill.source_bill_number,
  bill.source_bill_title,
  queue.prism_rule_set_id,
  queue.prism_rule_set_version,
  queue.queue_state,
  queue.expected_trait_count,
  queue.receipt_count,
  queue.attempt_count,
  queue.eligible_at,
  queue.next_attempt_at,
  queue.locked_at,
  queue.locked_by,
  queue.last_failure_class,
  queue.last_error_code,
  queue.completed_at,
  queue.created_at,
  queue.updated_at
from public.civic_genome_prism_verification_queue queue
join public.civic_genome_bill bill
  on bill.genome_bill_id = queue.genome_bill_id;

alter table public.civic_genome_prism_verification_queue enable row level security;
alter table public.civic_genome_prism_verification_queue force row level security;

revoke all on table public.civic_genome_prism_verification_queue
  from public, anon, authenticated;
revoke all on table public.v_civic_genome_prism_verification_queue_status
  from public, anon, authenticated;

grant select, insert, update on table public.civic_genome_prism_verification_queue
  to service_role;
grant select on table public.v_civic_genome_prism_verification_queue_status
  to service_role;
