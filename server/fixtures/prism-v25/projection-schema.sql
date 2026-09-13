-- Isolated table fixture uses observed production column types. It is not a full schema replay.
create schema if not exists private;
create schema if not exists extensions;
do $roles$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $roles$;
create table public.civic_genome_assembly_run (
  assembly_run_id uuid default gen_random_uuid() primary key,
  genome_bill_id uuid,
  source_document_id bigint,
  extraction_run_id text,
  engine_version text,
  rule_version text,
  input_hash text,
  output_hash text,
  verification_state text,
  coverage_json jsonb default '{}'::jsonb,
  trait_count integer default 0,
  malformed_object_count integer default 0,
  run_status text,
  error_code text,
  created_at timestamp with time zone default now(),
  completed_at timestamp with time zone,
  rosetta_engine_version text,
  rosetta_rule_set_version text,
  rosetta_rule_manifest_hash text,
  rosetta_configuration_hash text,
  rosetta_source_identity_hash text,
  rosetta_source_content_hash text,
  rosetta_output_content_hash text,
  rosetta_source_url text,
  rosetta_source_version text);
create table public.civic_genome_prism_verification_run (
  verification_run_id uuid default gen_random_uuid() primary key,
  genome_bill_id uuid,
  assembly_run_id uuid,
  source_document_id bigint,
  extraction_run_id text,
  prism_engine_version text,
  prism_rule_set_id text,
  prism_rule_set_version text,
  expected_trait_count integer,
  receipt_count integer,
  status_counts jsonb,
  input_hash text,
  output_hash text,
  receipt_manifest_hash text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now());
create table public.civic_genome_prism_verification_binding (
  binding_id uuid default gen_random_uuid() primary key,
  genome_bill_id uuid,
  assembly_run_id uuid,
  trait_id uuid,
  source_document_id bigint,
  extraction_run_id text,
  source_object_id text,
  request_id text,
  prism_verification_receipt_id uuid,
  prism_engine_version text,
  prism_rule_set_id text,
  prism_rule_set_version text,
  prism_rule_set_hash text,
  verification_status text,
  input_hash text,
  output_hash text,
  deterministic_replay_key text,
  created_at timestamp with time zone default now());
create table public.civic_genome_trait (
  trait_id uuid default gen_random_uuid() primary key,
  genome_bill_id uuid,
  trait_class text,
  trait_key text,
  normalized_value_json jsonb default 'null'::jsonb,
  source_object_type text,
  source_object_id text,
  source_block_id text,
  extraction_run_id text,
  confidence_score numeric default 0,
  signal_status text,
  trait_fingerprint text,
  methodology_version text,
  source_trace jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  source_document_id bigint,
  verification_state text,
  engine_version text,
  rule_version text,
  content_hash text);
create table public.lighthouse_prism_verification_requests (
  request_id text primary key,
  lighthouse_case_id text,
  evidence_document_id text,
  evidence_fingerprint text,
  source_content_hash text,
  claim_assertion_id text,
  rule_set_id text,
  rule_set_version text,
  requested_checks jsonb,
  originating_lighthouse_commit text,
  originating_lighthouse_runtime_version text,
  input_hash text,
  bridge_state text default 'pending'::text,
  failure_class text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  superseded_by_request_id text,
  superseded_at timestamp with time zone);
create table public.lighthouse_prism_verification_receipts (
  prism_verification_receipt_id uuid default gen_random_uuid() primary key,
  request_id text,
  prism_engine_version text,
  rule_set_id text,
  rule_set_version text,
  rule_set_hash text,
  input_hash text,
  output_hash text,
  verification_status text,
  supported_findings jsonb default '[]'::jsonb,
  contradictions jsonb default '[]'::jsonb,
  missing_evidence jsonb default '[]'::jsonb,
  unresolved_conditions jsonb default '[]'::jsonb,
  cited_evidence_identifiers jsonb default '[]'::jsonb,
  deterministic_replay_key text,
  prism_completion_timestamp timestamp with time zone,
  retrieved_at timestamp with time zone default now());
create table public.legal_patterns (
  pattern_id uuid default gen_random_uuid() primary key,
  source_relation text,
  source_record_key text,
  pattern_type text,
  title text,
  description text,
  jurisdiction_scope jsonb default '{}'::jsonb,
  authority_refs jsonb default '[]'::jsonb,
  contradiction_refs jsonb default '[]'::jsonb,
  enforcement_refs jsonb default '[]'::jsonb,
  verification_state text,
  engine_id text,
  engine_version text,
  rule_id text,
  rule_version text,
  input_hash text,
  pattern_hash text,
  first_observed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  supersedes_id uuid,
  is_current boolean default true);

create unique index legal_patterns_pattern_hash_unique on public.legal_patterns(pattern_hash);
create table public.civic_genome_bill (
  genome_bill_id uuid primary key,state_code text,source_bill_number text,source_bill_title text,source_bill_url text);
create table public.civic_genome_bill_version (
  bill_version_id uuid primary key,genome_bill_id uuid,assembly_run_id uuid,source_bill_id bigint,
  source_document_key text,document_family text,version_type text,stage_rank integer,chamber text);
create table public.docket_bill_source_document (
  source_document_key text primary key,source_url text,provider_hash text);
create table public.civic_genome_prism_verification_queue (
  queue_id uuid primary key default gen_random_uuid(),assembly_run_id uuid,genome_bill_id uuid,
  prism_rule_set_id text,prism_rule_set_version text,queue_state text,expected_trait_count integer,
  receipt_count integer,eligible_at timestamptz,next_attempt_at timestamptz,
  unique(assembly_run_id,prism_rule_set_id,prism_rule_set_version));

