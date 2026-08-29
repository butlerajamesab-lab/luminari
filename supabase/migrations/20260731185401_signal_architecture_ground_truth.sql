-- Canonical Luminari signal architecture.
--
-- Domain 1: case-intake breakpoints.
-- Domain 2: legal structural patterns (not signals).
-- Domain 3: statistically evidenced Atlas live-data signals.
-- Convergence occurs only after independent domain outputs exist.
--
-- Legacy detected_signals/live_signals remain preserved as historical evidence
-- and are not silently copied into these canonical stores.

create schema if not exists private;

create or replace function public.signal_architecture_hash_v1(p_payload jsonb)
returns text
language sql
immutable
strict
set search_path to 'pg_catalog', 'extensions'
as $function$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$function$;

revoke all on function public.signal_architecture_hash_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.signal_architecture_hash_v1(jsonb)
  to service_role;

create table if not exists public.signal_domain_registry (
  domain_code text primary key,
  domain_label text not null,
  canonical_relation text not null unique,
  source_owner text not null,
  description text not null,
  source_boundary text not null,
  severity_policy text not null,
  confidence_policy text not null,
  is_source_domain boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signal_domain_registry_code_check check (
    domain_code in ('case_intake', 'legal_pattern', 'live_data', 'convergence')
  )
);

insert into public.signal_domain_registry (
  domain_code,
  domain_label,
  canonical_relation,
  source_owner,
  description,
  source_boundary,
  severity_policy,
  confidence_policy,
  is_source_domain
) values
  ('case_intake','Case Intake Signals','public.intake_signals','Lighthouse intake','Breakpoints experienced by people navigating civic systems.','User narratives, intake records, intake verification records, and intake layer receipts only.','No required severity score; urgency and stabilization remain intake-owned fields.','Verification state is explicit; no statistical confidence is invented.',true),
  ('legal_pattern','Legal Patterns','public.legal_patterns','Lighthouse legal analysis / Rosetta-admissible outputs','Gaps, contradictions, enforcement weaknesses, and doctrinal conflicts in legal material.','Statutes, case law, enforcement records, declared rules, and provenance-bound legal decomposition only.','Patterns are not severity-tagged live signals.','Verification state and engine/rule receipts replace transport-time confidence invention.',true),
  ('live_data','Live Data Stream Signals','public.live_data_signals','Atlas detection engines','Entity, geographic, frequency, and unresolved-record detections derived from Atlas observations.','Allowlisted Atlas signal_events and provenance-bound deterministic detection outputs only.','Severity is mandatory and must be supplied by the declared detection rule.','Confidence is mandatory, bounded from 0 through 1, and must be supplied by the declared detection rule.',true),
  ('convergence','Three-Domain Convergence','public.signal_convergences','Prism / governed convergence analysis','Explicit intersections between one intake signal, one legal pattern, and one live-data signal.','References canonical outputs from all three source domains; never reads mixed legacy rows as source truth.','Convergence has a governed status, not an inherited or averaged severity.','No blended confidence is calculated unless a declared convergence rule explicitly produces one.',false)
on conflict (domain_code) do update set
  domain_label = excluded.domain_label,
  canonical_relation = excluded.canonical_relation,
  source_owner = excluded.source_owner,
  description = excluded.description,
  source_boundary = excluded.source_boundary,
  severity_policy = excluded.severity_policy,
  confidence_policy = excluded.confidence_policy,
  is_source_domain = excluded.is_source_domain,
  updated_at = now();

create table if not exists public.intake_signals (
  signal_id uuid primary key default gen_random_uuid(),
  source_intake_session_id uuid not null,
  source_layer_run_id uuid,
  source_record_refs jsonb not null default '[]'::jsonb,
  case_reference text,
  breakpoint_type text not null,
  title text not null,
  description text not null,
  jurisdiction_id text,
  verification_state text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  rule_id text not null,
  rule_version text not null,
  input_hash text not null,
  signal_hash text not null unique,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.intake_signals(signal_id),
  is_current boolean not null default true,
  constraint intake_signals_verification_state_check check (verification_state in ('user_reported','document_stated','supported_one_source','supported_multiple_sources','contradicted','disputed','incomplete','unresolved','verified')),
  constraint intake_signals_source_record_refs_check check (jsonb_typeof(source_record_refs) = 'array'),
  constraint intake_signals_evidence_refs_check check (jsonb_typeof(evidence_refs) = 'array'),
  constraint intake_signals_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint intake_signals_signal_hash_check check (signal_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_intake_signals_session_current on public.intake_signals(source_intake_session_id, is_current, created_at desc);
create index if not exists idx_intake_signals_jurisdiction on public.intake_signals(jurisdiction_id) where is_current;

create table if not exists public.legal_patterns (
  pattern_id uuid primary key default gen_random_uuid(),
  source_relation text not null,
  source_record_key text not null,
  pattern_type text not null,
  title text not null,
  description text not null,
  jurisdiction_scope jsonb not null default '{}'::jsonb,
  authority_refs jsonb not null default '[]'::jsonb,
  contradiction_refs jsonb not null default '[]'::jsonb,
  enforcement_refs jsonb not null default '[]'::jsonb,
  verification_state text not null,
  engine_id text not null,
  engine_version text not null,
  rule_id text not null,
  rule_version text not null,
  input_hash text not null,
  pattern_hash text not null unique,
  first_observed_at timestamptz,
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.legal_patterns(pattern_id),
  is_current boolean not null default true,
  constraint legal_patterns_type_check check (pattern_type in ('legal_gap','statutory_contradiction','enforcement_gap','doctrinal_conflict','override_conflict','definition_conflict','workflow_gap','accountability_gap','other')),
  constraint legal_patterns_verification_state_check check (verification_state in ('document_stated','supported_one_source','supported_multiple_sources','contradicted','disputed','incomplete','unresolved','verified')),
  constraint legal_patterns_jurisdiction_scope_check check (jsonb_typeof(jurisdiction_scope) = 'object'),
  constraint legal_patterns_authority_refs_check check (jsonb_typeof(authority_refs) = 'array'),
  constraint legal_patterns_contradiction_refs_check check (jsonb_typeof(contradiction_refs) = 'array'),
  constraint legal_patterns_enforcement_refs_check check (jsonb_typeof(enforcement_refs) = 'array'),
  constraint legal_patterns_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint legal_patterns_pattern_hash_check check (pattern_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_legal_patterns_type_current on public.legal_patterns(pattern_type, is_current, created_at desc);
create index if not exists idx_legal_patterns_source on public.legal_patterns(source_relation, source_record_key);

create table if not exists public.live_data_signals (
  live_data_signal_id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  title text not null,
  description text not null,
  primary_stream_id text not null,
  source_event_refs jsonb not null,
  entity_ids text[] not null default array[]::text[],
  entity_resolution_status text not null,
  jurisdiction_id text not null,
  severity text not null,
  confidence_score numeric(7,6) not null,
  verification_state text not null,
  supporting_statistics jsonb not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  detection_rule_id text not null,
  detection_rule_version text not null,
  engine_id text not null,
  engine_version text not null,
  input_hash text not null,
  signal_hash text not null unique,
  source_freshness_at timestamptz not null,
  detected_at timestamptz not null,
  created_at timestamptz not null default now(),
  governance_status text not null default 'observation_candidate',
  supersedes_id uuid references public.live_data_signals(live_data_signal_id),
  is_current boolean not null default true,
  constraint live_data_signals_source_event_refs_check check (jsonb_typeof(source_event_refs) = 'array' and jsonb_array_length(source_event_refs) > 0),
  constraint live_data_signals_entity_resolution_status_check check (entity_resolution_status in ('resolved','ambiguous','unresolved','ignored')),
  constraint live_data_signals_severity_check check (severity in ('critical','high','medium','low','informational')),
  constraint live_data_signals_confidence_check check (confidence_score >= 0 and confidence_score <= 1),
  constraint live_data_signals_verification_state_check check (verification_state in ('supported_one_source','supported_multiple_sources','contradicted','disputed','incomplete','unresolved','verified')),
  constraint live_data_signals_statistics_check check (jsonb_typeof(supporting_statistics) = 'object' and supporting_statistics <> '{}'::jsonb),
  constraint live_data_signals_evidence_refs_check check (jsonb_typeof(evidence_refs) = 'array'),
  constraint live_data_signals_governance_status_check check (governance_status in ('observation_candidate','review_hold','promoted','rejected')),
  constraint live_data_signals_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint live_data_signals_signal_hash_check check (signal_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_live_data_signals_stream_current on public.live_data_signals(primary_stream_id, is_current, detected_at desc);
create index if not exists idx_live_data_signals_jurisdiction on public.live_data_signals(jurisdiction_id, detected_at desc) where is_current;
create index if not exists idx_live_data_signals_entity_ids on public.live_data_signals using gin(entity_ids);

create table if not exists public.signal_convergences (
  convergence_id uuid primary key default gen_random_uuid(),
  intake_signal_id uuid not null references public.intake_signals(signal_id),
  legal_pattern_id uuid not null references public.legal_patterns(pattern_id),
  live_data_signal_id uuid not null references public.live_data_signals(live_data_signal_id),
  convergence_type text not null default 'three_domain_intersection',
  title text not null,
  description text not null,
  intersection_basis jsonb not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  rule_id text not null,
  rule_version text not null,
  engine_id text not null,
  engine_version text not null,
  input_hash text not null,
  convergence_hash text not null unique,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.signal_convergences(convergence_id),
  is_current boolean not null default true,
  constraint signal_convergences_type_check check (convergence_type = 'three_domain_intersection'),
  constraint signal_convergences_basis_check check (jsonb_typeof(intersection_basis) = 'object' and intersection_basis <> '{}'::jsonb),
  constraint signal_convergences_evidence_refs_check check (jsonb_typeof(evidence_refs) = 'array'),
  constraint signal_convergences_status_check check (status in ('candidate','review_hold','actionable','rejected')),
  constraint signal_convergences_input_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint signal_convergences_hash_check check (convergence_hash ~ '^[0-9a-f]{64}$'),
  constraint signal_convergences_domain_tuple_unique unique (intake_signal_id, legal_pattern_id, live_data_signal_id, rule_id, rule_version, convergence_hash)
);
create index if not exists idx_signal_convergences_status_current on public.signal_convergences(status, is_current, created_at desc);

create or replace function public.guard_signal_architecture_immutable_v1()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $function$
begin
  if tg_op = 'DELETE' then raise exception '% is append-only; delete is not permitted', tg_table_name; end if;
  if (to_jsonb(new) - 'is_current') is distinct from (to_jsonb(old) - 'is_current') then raise exception '% records are immutable; create a superseding record instead', tg_table_name; end if;
  return new;
end
$function$;
revoke all on function public.guard_signal_architecture_immutable_v1() from public, anon, authenticated, service_role;

create or replace trigger intake_signals_immutable_v1 before update or delete on public.intake_signals for each row execute function public.guard_signal_architecture_immutable_v1();
create or replace trigger legal_patterns_immutable_v1 before update or delete on public.legal_patterns for each row execute function public.guard_signal_architecture_immutable_v1();
create or replace trigger live_data_signals_immutable_v1 before update or delete on public.live_data_signals for each row execute function public.guard_signal_architecture_immutable_v1();
create or replace trigger signal_convergences_immutable_v1 before update or delete on public.signal_convergences for each row execute function public.guard_signal_architecture_immutable_v1();

-- Registration functions are intentionally separate by domain.
create or replace function public.register_intake_signal_v1(p_record jsonb) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','extensions' as $function$
declare v_hash text; v_input_hash text; v_signal_id uuid; v_supersedes_id uuid;
begin
  if coalesce(p_record->>'source_intake_session_id','')='' or coalesce(p_record->>'breakpoint_type','')='' or coalesce(p_record->>'title','')='' or coalesce(p_record->>'description','')='' or coalesce(p_record->>'verification_state','')='' or coalesce(p_record->>'rule_id','')='' or coalesce(p_record->>'rule_version','')='' then raise exception 'intake signal is missing required source, breakpoint, verification, or rule fields'; end if;
  v_input_hash := public.signal_architecture_hash_v1(p_record - 'created_at');
  v_hash := public.signal_architecture_hash_v1(jsonb_build_object('domain','case_intake','source_intake_session_id',p_record->>'source_intake_session_id','source_layer_run_id',p_record->>'source_layer_run_id','source_record_refs',coalesce(p_record->'source_record_refs','[]'::jsonb),'case_reference',p_record->>'case_reference','breakpoint_type',p_record->>'breakpoint_type','title',p_record->>'title','description',p_record->>'description','jurisdiction_id',p_record->>'jurisdiction_id','verification_state',p_record->>'verification_state','evidence_refs',coalesce(p_record->'evidence_refs','[]'::jsonb),'rule_id',p_record->>'rule_id','rule_version',p_record->>'rule_version'));
  v_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid;
  insert into public.intake_signals(source_intake_session_id,source_layer_run_id,source_record_refs,case_reference,breakpoint_type,title,description,jurisdiction_id,verification_state,evidence_refs,rule_id,rule_version,input_hash,signal_hash,observed_at,supersedes_id)
  values ((p_record->>'source_intake_session_id')::uuid,nullif(p_record->>'source_layer_run_id','')::uuid,coalesce(p_record->'source_record_refs','[]'::jsonb),nullif(p_record->>'case_reference',''),p_record->>'breakpoint_type',p_record->>'title',p_record->>'description',nullif(p_record->>'jurisdiction_id',''),p_record->>'verification_state',coalesce(p_record->'evidence_refs','[]'::jsonb),p_record->>'rule_id',p_record->>'rule_version',v_input_hash,v_hash,nullif(p_record->>'observed_at','')::timestamptz,v_supersedes_id)
  on conflict (signal_hash) do nothing returning signal_id into v_signal_id;
  if v_signal_id is null then select signal_id into v_signal_id from public.intake_signals where signal_hash=v_hash; elsif v_supersedes_id is not null then update public.intake_signals set is_current=false where signal_id=v_supersedes_id; end if;
  return v_signal_id;
end $function$;

create or replace function public.register_legal_pattern_v1(p_record jsonb) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','extensions' as $function$
declare v_hash text; v_input_hash text; v_pattern_id uuid; v_supersedes_id uuid;
begin
  if coalesce(p_record->>'source_relation','')='' or coalesce(p_record->>'source_record_key','')='' or coalesce(p_record->>'pattern_type','')='' or coalesce(p_record->>'title','')='' or coalesce(p_record->>'description','')='' or coalesce(p_record->>'verification_state','')='' or coalesce(p_record->>'engine_id','')='' or coalesce(p_record->>'engine_version','')='' or coalesce(p_record->>'rule_id','')='' or coalesce(p_record->>'rule_version','')='' then raise exception 'legal pattern is missing required source, engine, verification, or rule fields'; end if;
  v_input_hash := public.signal_architecture_hash_v1(p_record - 'created_at');
  v_hash := public.signal_architecture_hash_v1(jsonb_build_object('domain','legal_pattern','source_relation',p_record->>'source_relation','source_record_key',p_record->>'source_record_key','pattern_type',p_record->>'pattern_type','title',p_record->>'title','description',p_record->>'description','jurisdiction_scope',coalesce(p_record->'jurisdiction_scope','{}'::jsonb),'authority_refs',coalesce(p_record->'authority_refs','[]'::jsonb),'contradiction_refs',coalesce(p_record->'contradiction_refs','[]'::jsonb),'enforcement_refs',coalesce(p_record->'enforcement_refs','[]'::jsonb),'verification_state',p_record->>'verification_state','engine_id',p_record->>'engine_id','engine_version',p_record->>'engine_version','rule_id',p_record->>'rule_id','rule_version',p_record->>'rule_version'));
  v_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid;
  insert into public.legal_patterns(source_relation,source_record_key,pattern_type,title,description,jurisdiction_scope,authority_refs,contradiction_refs,enforcement_refs,verification_state,engine_id,engine_version,rule_id,rule_version,input_hash,pattern_hash,first_observed_at,supersedes_id)
  values (p_record->>'source_relation',p_record->>'source_record_key',p_record->>'pattern_type',p_record->>'title',p_record->>'description',coalesce(p_record->'jurisdiction_scope','{}'::jsonb),coalesce(p_record->'authority_refs','[]'::jsonb),coalesce(p_record->'contradiction_refs','[]'::jsonb),coalesce(p_record->'enforcement_refs','[]'::jsonb),p_record->>'verification_state',p_record->>'engine_id',p_record->>'engine_version',p_record->>'rule_id',p_record->>'rule_version',v_input_hash,v_hash,nullif(p_record->>'first_observed_at','')::timestamptz,v_supersedes_id)
  on conflict (pattern_hash) do nothing returning pattern_id into v_pattern_id;
  if v_pattern_id is null then select pattern_id into v_pattern_id from public.legal_patterns where pattern_hash=v_hash; elsif v_supersedes_id is not null then update public.legal_patterns set is_current=false where pattern_id=v_supersedes_id; end if;
  return v_pattern_id;
end $function$;

create or replace function public.register_live_data_signal_v1(p_record jsonb) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','extensions' as $function$
declare v_hash text; v_input_hash text; v_signal_id uuid; v_supersedes_id uuid; v_entity_ids text[];
begin
  if coalesce(p_record->>'signal_type','')='' or coalesce(p_record->>'title','')='' or coalesce(p_record->>'description','')='' or coalesce(p_record->>'primary_stream_id','')='' or coalesce(p_record->>'entity_resolution_status','')='' or coalesce(p_record->>'jurisdiction_id','')='' or coalesce(p_record->>'severity','')='' or p_record->>'confidence_score' is null or coalesce(p_record->>'verification_state','')='' or coalesce(p_record->>'detection_rule_id','')='' or coalesce(p_record->>'detection_rule_version','')='' or coalesce(p_record->>'engine_id','')='' or coalesce(p_record->>'engine_version','')='' or coalesce(p_record->>'source_freshness_at','')='' or coalesce(p_record->>'detected_at','')='' then raise exception 'live-data signal is missing required evidence, entity, score, engine, or rule fields'; end if;
  if coalesce(jsonb_typeof(p_record->'source_event_refs'),'') <> 'array' or coalesce(jsonb_array_length(p_record->'source_event_refs'),0)=0 then raise exception 'live-data signal requires at least one Atlas source event reference'; end if;
  if coalesce(jsonb_typeof(p_record->'supporting_statistics'),'') <> 'object' or p_record->'supporting_statistics'='{}'::jsonb then raise exception 'live-data signal requires non-empty supporting statistics'; end if;
  select coalesce(array_agg(value),array[]::text[]) into v_entity_ids from jsonb_array_elements_text(coalesce(p_record->'entity_ids','[]'::jsonb)) as value;
  v_input_hash := public.signal_architecture_hash_v1(p_record - 'created_at');
  v_hash := public.signal_architecture_hash_v1(jsonb_build_object('domain','live_data','signal_type',p_record->>'signal_type','title',p_record->>'title','description',p_record->>'description','primary_stream_id',p_record->>'primary_stream_id','source_event_refs',p_record->'source_event_refs','entity_ids',coalesce(p_record->'entity_ids','[]'::jsonb),'entity_resolution_status',p_record->>'entity_resolution_status','jurisdiction_id',p_record->>'jurisdiction_id','severity',p_record->>'severity','confidence_score',p_record->>'confidence_score','verification_state',p_record->>'verification_state','supporting_statistics',p_record->'supporting_statistics','evidence_refs',coalesce(p_record->'evidence_refs','[]'::jsonb),'detection_rule_id',p_record->>'detection_rule_id','detection_rule_version',p_record->>'detection_rule_version','engine_id',p_record->>'engine_id','engine_version',p_record->>'engine_version','source_freshness_at',p_record->>'source_freshness_at','detected_at',p_record->>'detected_at'));
  v_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid;
  insert into public.live_data_signals(signal_type,title,description,primary_stream_id,source_event_refs,entity_ids,entity_resolution_status,jurisdiction_id,severity,confidence_score,verification_state,supporting_statistics,evidence_refs,detection_rule_id,detection_rule_version,engine_id,engine_version,input_hash,signal_hash,source_freshness_at,detected_at,governance_status,supersedes_id)
  values (p_record->>'signal_type',p_record->>'title',p_record->>'description',p_record->>'primary_stream_id',p_record->'source_event_refs',v_entity_ids,p_record->>'entity_resolution_status',p_record->>'jurisdiction_id',p_record->>'severity',(p_record->>'confidence_score')::numeric,p_record->>'verification_state',p_record->'supporting_statistics',coalesce(p_record->'evidence_refs','[]'::jsonb),p_record->>'detection_rule_id',p_record->>'detection_rule_version',p_record->>'engine_id',p_record->>'engine_version',v_input_hash,v_hash,(p_record->>'source_freshness_at')::timestamptz,(p_record->>'detected_at')::timestamptz,coalesce(nullif(p_record->>'governance_status',''),'observation_candidate'),v_supersedes_id)
  on conflict (signal_hash) do nothing returning live_data_signal_id into v_signal_id;
  if v_signal_id is null then select live_data_signal_id into v_signal_id from public.live_data_signals where signal_hash=v_hash; elsif v_supersedes_id is not null then update public.live_data_signals set is_current=false where live_data_signal_id=v_supersedes_id; end if;
  return v_signal_id;
end $function$;

create or replace function public.register_signal_convergence_v1(p_record jsonb) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','extensions' as $function$
declare v_hash text; v_input_hash text; v_convergence_id uuid; v_supersedes_id uuid;
begin
  if coalesce(p_record->>'intake_signal_id','')='' or coalesce(p_record->>'legal_pattern_id','')='' or coalesce(p_record->>'live_data_signal_id','')='' or coalesce(p_record->>'title','')='' or coalesce(p_record->>'description','')='' or coalesce(p_record->>'rule_id','')='' or coalesce(p_record->>'rule_version','')='' or coalesce(p_record->>'engine_id','')='' or coalesce(p_record->>'engine_version','')='' then raise exception 'convergence requires one canonical record from every source domain and declared rule/engine receipts'; end if;
  if coalesce(jsonb_typeof(p_record->'intersection_basis'),'') <> 'object' or p_record->'intersection_basis'='{}'::jsonb then raise exception 'convergence requires an explicit non-empty intersection basis'; end if;
  v_input_hash := public.signal_architecture_hash_v1(p_record - 'created_at');
  v_hash := public.signal_architecture_hash_v1(jsonb_build_object('domain','convergence','intake_signal_id',p_record->>'intake_signal_id','legal_pattern_id',p_record->>'legal_pattern_id','live_data_signal_id',p_record->>'live_data_signal_id','title',p_record->>'title','description',p_record->>'description','intersection_basis',p_record->'intersection_basis','evidence_refs',coalesce(p_record->'evidence_refs','[]'::jsonb),'rule_id',p_record->>'rule_id','rule_version',p_record->>'rule_version','engine_id',p_record->>'engine_id','engine_version',p_record->>'engine_version','status',coalesce(nullif(p_record->>'status',''),'candidate')));
  v_supersedes_id := nullif(p_record->>'supersedes_id','')::uuid;
  insert into public.signal_convergences(intake_signal_id,legal_pattern_id,live_data_signal_id,title,description,intersection_basis,evidence_refs,rule_id,rule_version,engine_id,engine_version,input_hash,convergence_hash,status,supersedes_id)
  values ((p_record->>'intake_signal_id')::uuid,(p_record->>'legal_pattern_id')::uuid,(p_record->>'live_data_signal_id')::uuid,p_record->>'title',p_record->>'description',p_record->'intersection_basis',coalesce(p_record->'evidence_refs','[]'::jsonb),p_record->>'rule_id',p_record->>'rule_version',p_record->>'engine_id',p_record->>'engine_version',v_input_hash,v_hash,coalesce(nullif(p_record->>'status',''),'candidate'),v_supersedes_id)
  on conflict (convergence_hash) do nothing returning convergence_id into v_convergence_id;
  if v_convergence_id is null then select convergence_id into v_convergence_id from public.signal_convergences where convergence_hash=v_hash; elsif v_supersedes_id is not null then update public.signal_convergences set is_current=false where convergence_id=v_supersedes_id; end if;
  return v_convergence_id;
end $function$;

revoke all on function public.register_intake_signal_v1(jsonb) from public,anon,authenticated;
revoke all on function public.register_legal_pattern_v1(jsonb) from public,anon,authenticated;
revoke all on function public.register_live_data_signal_v1(jsonb) from public,anon,authenticated;
revoke all on function public.register_signal_convergence_v1(jsonb) from public,anon,authenticated;
grant execute on function public.register_intake_signal_v1(jsonb) to service_role;
grant execute on function public.register_legal_pattern_v1(jsonb) to service_role;
grant execute on function public.register_live_data_signal_v1(jsonb) to service_role;
grant execute on function public.register_signal_convergence_v1(jsonb) to service_role;

create or replace view public.v_signal_architecture_summary with (security_invoker=true) as
with counts as (
 select 'case_intake'::text domain_code,count(*)::bigint total_record_count,count(*) filter(where is_current)::bigint current_record_count,max(created_at) latest_record_at from public.intake_signals
 union all select 'legal_pattern',count(*)::bigint,count(*) filter(where is_current)::bigint,max(created_at) from public.legal_patterns
 union all select 'live_data',count(*)::bigint,count(*) filter(where is_current)::bigint,max(created_at) from public.live_data_signals
 union all select 'convergence',count(*)::bigint,count(*) filter(where is_current)::bigint,max(created_at) from public.signal_convergences)
select r.domain_code,r.domain_label,r.canonical_relation,r.source_owner,r.description,r.source_boundary,r.severity_policy,r.confidence_policy,r.is_source_domain,coalesce(c.total_record_count,0)::bigint total_record_count,coalesce(c.current_record_count,0)::bigint current_record_count,c.latest_record_at
from public.signal_domain_registry r left join counts c using(domain_code)
order by case r.domain_code when 'case_intake' then 1 when 'legal_pattern' then 2 when 'live_data' then 3 else 4 end;

create or replace view public.v_signal_architecture_recent with (security_invoker=true) as
select 'case_intake'::text domain_code,signal_id::text record_id,title,description,jurisdiction_id,verification_state status,null::text severity,null::numeric confidence_score,null::text entity_resolution_status,source_intake_session_id::text source_reference,coalesce(observed_at,created_at) occurred_at,created_at from public.intake_signals where is_current
union all select 'legal_pattern',pattern_id::text,title,description,jurisdiction_scope->>'primary',verification_state,null::text,null::numeric,null::text,source_relation||':'||source_record_key,coalesce(first_observed_at,created_at),created_at from public.legal_patterns where is_current
union all select 'live_data',live_data_signal_id::text,title,description,jurisdiction_id,governance_status,severity,confidence_score,entity_resolution_status,primary_stream_id,detected_at,created_at from public.live_data_signals where is_current
union all select 'convergence',convergence_id::text,title,description,null::text,status,null::text,null::numeric,null::text,concat_ws(':',intake_signal_id::text,legal_pattern_id::text,live_data_signal_id::text),created_at,created_at from public.signal_convergences where is_current;

do $integrity_view$
declare
  legacy_detected_count_sql text;
  legacy_live_count_sql text;
begin
  legacy_detected_count_sql := case
    when to_regclass('public.detected_signals') is null then '0::bigint'
    else '(select count(*) from public.detected_signals)::bigint'
  end;
  legacy_live_count_sql := case
    when to_regclass('public.live_signals') is null then '0::bigint'
    else '(select count(*) from public.live_signals)::bigint'
  end;

  execute format($view$
    create or replace view public.v_signal_architecture_integrity
    with (security_invoker=true) as
    select
      (select count(*) from public.signal_events)::bigint as atlas_raw_observation_count,
      %s as legacy_detected_signals_count,
      %s as legacy_live_signals_count,
      (select count(*) from public.detected_signals_v2)::bigint as prior_v2_signal_count,
      (select count(*) from public.intake_signals where is_current)::bigint as intake_signal_count,
      (select count(*) from public.legal_patterns where is_current)::bigint as legal_pattern_count,
      (select count(*) from public.live_data_signals where is_current)::bigint as live_data_signal_count,
      (select count(*) from public.signal_convergences where is_current)::bigint as convergence_count,
      (select max(ingested_at) from public.signal_events) as latest_atlas_observation_at,
      'legacy_detected_signals_are_unclassified_evidence'::text as legacy_status,
      'raw_atlas_observations_are_not_live_data_signals'::text as atlas_status
  $view$, legacy_detected_count_sql, legacy_live_count_sql);
end
$integrity_view$;

alter table public.signal_domain_registry enable row level security;
alter table public.intake_signals enable row level security;
alter table public.legal_patterns enable row level security;
alter table public.live_data_signals enable row level security;
alter table public.signal_convergences enable row level security;
revoke all on table public.signal_domain_registry from public,anon,authenticated;
revoke all on table public.intake_signals from public,anon,authenticated;
revoke all on table public.legal_patterns from public,anon,authenticated;
revoke all on table public.live_data_signals from public,anon,authenticated;
revoke all on table public.signal_convergences from public,anon,authenticated;
revoke all on table public.v_signal_architecture_summary from public,anon,authenticated;
revoke all on table public.v_signal_architecture_recent from public,anon,authenticated;
revoke all on table public.v_signal_architecture_integrity from public,anon,authenticated;
grant select on table public.signal_domain_registry to service_role;
grant select,insert,update on table public.intake_signals to service_role;
grant select,insert,update on table public.legal_patterns to service_role;
grant select,insert,update on table public.live_data_signals to service_role;
grant select,insert,update on table public.signal_convergences to service_role;
grant select on table public.v_signal_architecture_summary to service_role;
grant select on table public.v_signal_architecture_recent to service_role;
grant select on table public.v_signal_architecture_integrity to service_role;
comment on table public.intake_signals is 'Domain 1 only: provenance-bound case-intake breakpoints. No legal patterns or Atlas stream detections.';
comment on table public.legal_patterns is 'Domain 2 only: legal structural patterns. These rows are not live-data signals.';
comment on table public.live_data_signals is 'Domain 3 only: deterministic Atlas-derived signal cards with explicit entity resolution, severity, confidence, statistics, and source-event references.';
comment on table public.signal_convergences is 'End-stage convergence only: one canonical record from each independent source domain.';
comment on view public.v_signal_architecture_integrity is 'Truthful count reconciliation; legacy mixed signal rows remain preserved but are not canonical domain records.';
