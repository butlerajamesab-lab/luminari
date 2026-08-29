create table if not exists public.package_registry (
  package_key text primary key,
  package_name text not null,
  canonical_platform text,
  classification text,
  canonical_role text,
  package_status text default 'declared',
  verification_status text default 'metadata_wrapped',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.deliverable_files (
  id bigserial primary key,
  package_key text references public.package_registry(package_key) on delete cascade,
  file_name text not null,
  file_type text,
  file_size_kb numeric(10,2),
  file_path text,
  delivery_date timestamptz default now(),
  version text,
  status text,
  content_hash text,
  is_critical boolean default false,
  description text,
  purpose text,
  artifact_status text default 'declared',
  verification_source text,
  verified_at timestamptz,
  constraint deliverable_files_artifact_status_check check (artifact_status in ('declared','uploaded_verified','provided_in_chat','bundle_declared','generated_by_install','repo_verified','runtime_verified','missing')),
  constraint deliverable_files_package_file_unique unique (package_key, file_name)
);

create table if not exists public.file_categories (
  id bigserial primary key,
  file_id bigint references public.deliverable_files(id) on delete cascade,
  category text,
  subcategory text,
  sequence_order int
);

create table if not exists public.expansion_packs (
  id bigserial primary key,
  package_key text references public.package_registry(package_key) on delete cascade,
  pack_name text not null,
  pack_code text,
  description text,
  in_option_b boolean default false,
  in_option_c boolean default true,
  dependencies text,
  file_id bigint references public.deliverable_files(id),
  unique(package_key, pack_name)
);

create table if not exists public.verification_audit (
  id bigserial primary key,
  file_id bigint references public.deliverable_files(id),
  old_status text,
  new_status text,
  verification_source text,
  verified_by text,
  verified_at timestamptz default now(),
  notes text
);

create table if not exists public.metadata_machines (
  id bigserial primary key,
  machine_key text unique not null,
  display_name text not null,
  package_key text references public.package_registry(package_key) on delete set null,
  canonical_platform text,
  classification text,
  canonical_role text,
  lineage_status text,
  implementation_status text,
  verification_boundary text,
  metadata_status text default 'metadata_wrapped',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.machine_outputs (
  id bigserial primary key,
  machine_key text references public.metadata_machines(machine_key) on delete cascade,
  output_key text not null,
  output_name text,
  output_type text,
  layer_classification text,
  description text,
  unique(machine_key, output_key)
);

create table if not exists public.machine_verification_requirements (
  id bigserial primary key,
  machine_key text references public.metadata_machines(machine_key) on delete cascade,
  requirement_key text not null,
  requirement_description text,
  status text default 'pending',
  proof_source text,
  unique(machine_key, requirement_key)
);

create index if not exists idx_deliverable_package on public.deliverable_files(package_key);
create index if not exists idx_deliverable_artifact_status on public.deliverable_files(artifact_status);
create index if not exists idx_machine_key on public.metadata_machines(machine_key);

insert into public.package_registry (package_key, package_name, canonical_platform, classification, canonical_role, package_status, verification_status, notes)
values
('form_signal_extraction_package','Form Signal Extraction Engine Package','Lighthouse / Atlas boundary','metadata_wrapped_delivery_bundle','form signal extraction and staging package','declared','metadata_wrapped','Option B/C installation package for form signal extraction, staging, Sunam integration, and expansion packs.'),
('cda_export_spine','CDA Export Spine','Lighthouse','primary_structured_export_spine','overarching information-layer and export machine','canonical_user_provided','metadata_wrapped','CDA is an original-stack engine and the primary structured export spine. This registry entry does not create runtime CDA S1-S8 tables.')
on conflict (package_key) do update set package_name=excluded.package_name, canonical_platform=excluded.canonical_platform, classification=excluded.classification, canonical_role=excluded.canonical_role, package_status=excluded.package_status, verification_status=excluded.verification_status, notes=excluded.notes, updated_at=now();

insert into public.deliverable_files (package_key,file_name,file_type,file_size_kb,version,status,is_critical,description,purpose,artifact_status,verification_source,verified_at)
values
('form_signal_extraction_package','form-signal-extraction-engine-v2.js','JavaScript',34,'2.0','production',true,'Production-hardened form signal extraction engine','Core signal extraction pipeline','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','form-signal-extraction-engine.js','JavaScript',20,'1.0','reference',false,'Reference implementation v1.0','Legacy reference','bundle_declared','metadata_wrapper',now()),
('form_signal_extraction_package','install.js','JavaScript',18,'1.0','production',true,'Automated installation wizard','Setup orchestration Option B and C','bundle_declared','metadata_wrapper',now()),
('form_signal_extraction_package','verify.js','JavaScript',11,'1.0','production',true,'Installation verification script','Post-install validation','bundle_declared','metadata_wrapper',now()),
('form_signal_extraction_package','expansion-packs.js','JavaScript',20,'1.0','production',true,'All 10 expansion packs integrated','Feature expansion system','bundle_declared','metadata_wrapper',now()),
('form_signal_extraction_package','schema.sql','SQL',4.5,'1.0','production',true,'PostgreSQL schema for staging tables','Database initialization','bundle_declared','metadata_wrapper',now()),
('form_signal_extraction_package','FINAL-DELIVERY-MANIFEST.txt','Documentation',15,'1.0','production',true,'Complete package overview','Entry point for understanding delivery','provided_in_chat','chat_history',now()),
('form_signal_extraction_package','INSTALLATION-PACK-OVERVIEW-B-AND-C.md','Documentation',13,'1.0','production',true,'Comparison of Option B vs Option C','Installation decision guide','provided_in_chat','chat_history',now()),
('form_signal_extraction_package','COMPLETE-SETUP-GUIDE.md','Documentation',16,'1.0','production',true,'Step-by-step installation instructions','Complete setup walkthrough','provided_in_chat','chat_history',now()),
('form_signal_extraction_package','V2-SUMMARY.md','Documentation',11,'1.0','production',false,'V2 engine improvements and features','Technical summary','provided_in_chat','chat_history',now()),
('form_signal_extraction_package','PRODUCTION-HARDENING-PATCH.md','Documentation',27,'1.0','production',true,'All 10 production hardening fixes explained','Hardening reference','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','LUMINARI-INTEGRATION-GUIDE.md','Documentation',14,'1.0','production',true,'Sunam integration code and instructions','Luminari integration','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','FORM-SIGNAL-EXTRACTION-DOCUMENTATION.md','Documentation',15,'1.0','production',false,'Architecture reference for extraction engine','Architecture documentation','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','README.md','Documentation',9,'1.0','production',false,'Quick start guide','Quick reference','provided_in_chat','chat_history',now()),
('form_signal_extraction_package','START-HERE.txt','Documentation',8,'1.0','production',true,'Initial orientation document','Getting started','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','DELIVERABLES-INDEX.md','Documentation',11,'1.0','production',false,'Complete file manifest and descriptions','File inventory','uploaded_verified','chat_upload',now()),
('form_signal_extraction_package','METADATA-SCHEMA.sql','SQL',18,'1.0','production',true,'SQL metadata wrapper for entire package','Package documentation registry','generated_by_install','runtime',now())
on conflict (package_key, file_name) do update set file_type=excluded.file_type, file_size_kb=excluded.file_size_kb, version=excluded.version, status=excluded.status, is_critical=excluded.is_critical, description=excluded.description, purpose=excluded.purpose, artifact_status=excluded.artifact_status, verification_source=excluded.verification_source, verified_at=excluded.verified_at;

insert into public.expansion_packs (package_key, pack_name, pack_code, description, in_option_b, in_option_c)
values
('form_signal_extraction_package','Evidence Linker','evidence-linker','Links case law and enforcement records',true,true),
('form_signal_extraction_package','Remedy Templates','remedy-templates','Settlement estimation framework',true,true),
('form_signal_extraction_package','Mental Health Specialist','mental-health','Involuntary commitment and psych holds',false,true),
('form_signal_extraction_package','Deadline/SOL Calculator','deadline-sol','Statute of limitations calculation',false,true),
('form_signal_extraction_package','Appeal Pathway Navigator','appeal-pathway','Step-by-step appeal instructions',false,true),
('form_signal_extraction_package','Legal Aid Matcher','legal-aid','Free legal services matching',false,true),
('form_signal_extraction_package','Insurance Appeal Specialist','insurance','Insurance workflow handling',false,true),
('form_signal_extraction_package','Housing Crisis Module','housing','Eviction defense framework',false,true),
('form_signal_extraction_package','Wage Theft Prosecution','wage-theft','Wage calculation and recovery',false,true),
('form_signal_extraction_package','Agency Response Tracker','agency-tracking','Deadline monitoring and escalation',false,true)
on conflict (package_key, pack_name) do update set pack_code=excluded.pack_code, description=excluded.description, in_option_b=excluded.in_option_b, in_option_c=excluded.in_option_c;

insert into public.metadata_machines (machine_key, display_name, package_key, canonical_platform, classification, canonical_role, lineage_status, implementation_status, verification_boundary, metadata_status, notes)
values
('form_signal_extraction_engine_v2','Form Signal Extraction Engine v2','form_signal_extraction_package','Lighthouse / Atlas boundary','form_signal_extraction_and_staging_engine','extract form-like signals from raw text and produce proto-form staging outputs','original_or_recovered_luminari_engine_candidate','artifact_uploaded_and_metadata_wrapped_runtime_unverified','requires repo placement, schema application, Sunam wiring, and runtime verification','metadata_wrapped','One of multiple signal extractors; not CDA, not Prism reasoning, not Rosetta law translation.'),
('cda_export_spine','CDA Export Spine','cda_export_spine','Lighthouse','primary_structured_export_spine','overarching information-layer and export machine producing S1-S8 and O1-O4 outputs','original_stack_engine','repo_present_runtime_unverified_database_schema_drifted','requires cdaRouter mount proof, live CDA S1-S8 schema, route proof, data writes, and export proof','metadata_wrapped','CDA is the primary structured export spine. Current live DB CDA tables are not proof of canonical CDA completeness.')
on conflict (machine_key) do update set display_name=excluded.display_name, package_key=excluded.package_key, canonical_platform=excluded.canonical_platform, classification=excluded.classification, canonical_role=excluded.canonical_role, lineage_status=excluded.lineage_status, implementation_status=excluded.implementation_status, verification_boundary=excluded.verification_boundary, metadata_status=excluded.metadata_status, notes=excluded.notes, updated_at=now();

insert into public.machine_outputs (machine_key, output_key, output_name, output_type, layer_classification, description)
values
('form_signal_extraction_engine_v2','forms_registry_staging','Forms Registry Staging','staging_table','signal_metadata','Main proto-form staging output.'),
('form_signal_extraction_engine_v2','agency_candidates','Agency Candidates','staging_table','signal_metadata','One row per agency candidate.'),
('form_signal_extraction_engine_v2','workflow_form_links_staging','Workflow Form Links Staging','staging_table','signal_metadata','One row per workflow candidate.'),
('cda_export_spine','S1','Document Index','ledger','L1-L4 metadata','CDA S1 Document Index.'),
('cda_export_spine','S2','Quote Ledger','ledger','L1 verbatim','CDA S2 Quote Ledger.'),
('cda_export_spine','S3','Claim Ledger','ledger','L2 normalized','CDA S3 Claim Ledger.'),
('cda_export_spine','S4','Denial Reason Ledger','ledger','L1-L2','CDA S4 Denial Reason Ledger.'),
('cda_export_spine','S5','Policy Clause Ledger','ledger','L1-L2','CDA S5 Policy Clause Ledger.'),
('cda_export_spine','S6','Comparison Matrix','ledger','L3 derived comparison','CDA S6 Comparison Matrix.'),
('cda_export_spine','S7','Evidence Gap Register','ledger','L3 derived gap','CDA S7 Evidence Gap Register.'),
('cda_export_spine','S8','Contradiction Register','ledger','L3 conflict metadata','CDA S8 Contradiction Register.'),
('cda_export_spine','O1-O4','Export Artifacts','export_bundle','artifact_output','CDA O1-O4 export/artifact outputs.')
on conflict (machine_key, output_key) do update set output_name=excluded.output_name, output_type=excluded.output_type, layer_classification=excluded.layer_classification, description=excluded.description;

insert into public.machine_verification_requirements (machine_key, requirement_key, requirement_description, status, proof_source)
values
('form_signal_extraction_engine_v2','repo_placement','Confirm engine file is placed in active repo path','pending',null),
('form_signal_extraction_engine_v2','schema_applied','Confirm forms staging tables exist in live DB','pending',null),
('form_signal_extraction_engine_v2','sunam_wiring','Confirm extract_form_signals tool is registered','pending',null),
('form_signal_extraction_engine_v2','runtime_test','Run verify.js and engine test harness in deployment environment','pending',null),
('cda_export_spine','repo_files','Confirm CDA bundle, zip, db, schema, pipeline, orchestrator, router files','partially_verified','GitHub connector'),
('cda_export_spine','router_mount','Confirm cdaRouter is mounted in active appRouter','pending',null),
('cda_export_spine','live_schema','Confirm CDA S1-S8 tables exist in target live DB','pending',null),
('cda_export_spine','runtime_export','Confirm live route/tRPC can produce S1-S8 and O1-O4 bundle','pending',null)
on conflict (machine_key, requirement_key) do update set requirement_description=excluded.requirement_description, status=excluded.status, proof_source=excluded.proof_source;

create or replace view public.verification_status_summary as
select artifact_status, count(*) as file_count, string_agg(file_name, ', ' order by file_name) as files
from public.deliverable_files
group by artifact_status;

create or replace view public.critical_files_verification as
select file_name, file_type, is_critical, artifact_status, verification_source,
case when artifact_status in ('uploaded_verified','provided_in_chat','runtime_verified','repo_verified') then 'VERIFIED'
     when artifact_status = 'generated_by_install' then 'GENERATED'
     else 'PENDING' end as verification_state
from public.deliverable_files
where is_critical = true;

create or replace view public.unverified_files as
select file_name, file_type, artifact_status, verification_source, 'NEEDS ACTION' as flag
from public.deliverable_files
where artifact_status not in ('uploaded_verified','provided_in_chat','generated_by_install','repo_verified','runtime_verified');

create or replace view public.verification_completeness as
select round(100.0 * count(*) filter (where artifact_status in ('uploaded_verified','provided_in_chat','generated_by_install','repo_verified','runtime_verified')) / nullif(count(*),0), 1) as percent_accounted_for,
count(*) filter (where artifact_status in ('uploaded_verified','provided_in_chat','generated_by_install','repo_verified','runtime_verified')) as accounted_files,
count(*) as total_files
from public.deliverable_files;

create or replace view public.package_classification as
select package_key, artifact_status, count(*) as file_count, coalesce(sum(file_size_kb),0) as total_size_kb
from public.deliverable_files
group by package_key, artifact_status;

