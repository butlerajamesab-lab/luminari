"""Exercise predecessor Drizzle storage against the actual runtime migration."""

from pathlib import Path
import os
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Legacy regression requires the dedicated loopback test database")

preflight = Path("supabase/migrations/20260909142900_lighthouse_legacy_runtime_preflight.sql").read_text()
runtime = Path("supabase/migrations/20260909143000_lighthouse_runtime_postgres_contract_v1.sql").read_text()
helpers = runtime.split("-- Ingestion and canonical registry contracts", 1)[0]
patterns = runtime.split("-- Canonical pattern backbone", 1)[1].split("-- Governed pattern/trend/strategy read projections", 1)[0]
workflows = runtime.split("-- User workflow compatibility: presentations, merge review, and feedback", 1)[1].split("-- Case state and LumenSend", 1)[0]

pattern_fixture = """
create table public.patterns (
  id uuid primary key default gen_random_uuid(), case_id uuid not null,
  snapshot_id uuid not null, pipeline_run_id uuid not null, signature text,
  occurrence_count integer, first_seen_at timestamptz, last_seen_at timestamptz,
  pattern_type text not null, description text, created_at timestamptz not null default now()
);
insert into public.patterns
select md5('pattern:'||n)::uuid, md5('case:'||n)::uuid, md5('snapshot:'||n)::uuid,
  md5('run:'||n)::uuid, 'shared_signature', n,
  '2026-04-09T21:55:28.822Z'::timestamptz + n * interval '1 minute',
  '2026-04-10T21:55:28.822Z'::timestamptz + n * interval '1 minute',
  'fixture_pattern', 'Preserve this record',
  '2026-04-09T21:55:28.822Z'::timestamptz + n * interval '1 minute'
from generate_series(1,3) n;
create table public.pattern_reference_fixture(pattern_id uuid references public.patterns(id));
insert into public.pattern_reference_fixture select id from public.patterns;
create temporary table original_patterns as select * from public.patterns;
"""
pattern_assertions = """
do $$ begin
  if (select count(*) from public.patterns)<>3 then raise exception 'Pattern row loss'; end if;
  if exists (select 1 from original_patterns s left join public.patterns p on p.id=s.id
    where p.id is null or p.case_id is distinct from s.case_id
      or p.snapshot_id is distinct from s.snapshot_id or p.pipeline_run_id is distinct from s.pipeline_run_id
      or p.created_at is distinct from (extract(epoch from s.created_at)*1000)::bigint
      or p.first_seen_at is distinct from (extract(epoch from s.first_seen_at)*1000)::bigint
      or p.last_seen_at is distinct from (extract(epoch from s.last_seen_at)*1000)::bigint
      or p.source_created_at is distinct from s.created_at::text
      or p.source_signature is distinct from s.signature
      or p.description is distinct from s.description or p.occurrence_count is distinct from s.occurrence_count) then
    raise exception 'Predecessor pattern identity, provenance, or dates changed';
  end if;
  if (select count(*) from public.pattern_reference_fixture r join public.patterns p on p.id=r.pattern_id)<>3 then
    raise exception 'UUID pattern references were broken';
  end if;
end $$;
"""
workflow_fixture = """
create type public.fixture_merge_status as enum ('pending','approved','rejected');
create type public.fixture_feedback_type as enum ('suggestion','question','bug_report','praise','other');
create type public.fixture_feedback_status as enum ('new','reviewed','resolved');
create table public.presentations (
  id serial primary key, "caseId" integer not null, "userId" integer not null,
  title varchar(512) not null, description text, "snapshotId" integer,
  "slideCount" integer not null default 0, theme varchar(64) not null default 'courtroom',
  "createdAt" bigint not null, "updatedAt" bigint not null
);
create table public.presentation_slides (
  id serial primary key, "presentationId" integer not null references public.presentations(id),
  "orderIndex" integer not null, "slideType" varchar(64) not null, title varchar(512),
  content text, "sourceCitations" jsonb, notes text, layout varchar(64) not null default 'default', metadata jsonb
);
create table public.entity_merge_suggestions (
  id serial primary key, "caseId" integer not null, "sourceEntityId" integer not null,
  "targetEntityId" integer not null, confidence double precision not null, reason text not null,
  "mergeStatus" public.fixture_merge_status not null default 'pending', "reviewedAt" bigint,
  "reviewedBy" integer, "createdAt" bigint not null
);
create table public.user_feedback (
  id serial primary key, "userId" integer not null, "caseId" integer,
  "feedbackType" public.fixture_feedback_type not null default 'suggestion', message text not null,
  "currentPage" varchar(256), "pipelineType" varchar(64),
  "feedbackStatus" public.fixture_feedback_status not null default 'new', "createdAt" bigint not null
);
insert into public.presentations values (1,11,22,'Fixture title','Preserved description',33,1,'courtroom',1770000000123,1770000000456);
insert into public.presentation_slides values (1,1,2,'evidence_quote','Slide','Preserved content','[{"documentId":7,"quote":"Exact source"}]',null,'default','{"source":"fixture"}');
insert into public.entity_merge_suggestions values (1,11,44,55,0.8,'Source-grounded match','approved',1770000000789,22,1770000000123);
insert into public.user_feedback values (1,22,11,'question','Preserved feedback','/fixture','fixture','resolved',1770000000123);
"""
workflow_assertions = """
do $$ begin
  if not exists (select 1 from public.presentations where id=1 and case_id=11 and user_id=22
    and snapshot_id=33 and slide_count=1 and created_at=1770000000123 and updated_at=1770000000456) then
    raise exception 'Presentation ownership or timestamps were lost';
  end if;
  if not exists (select 1 from public.presentation_slides where id=1 and presentation_id=1 and order_index=2
    and slide_type='evidence_quote' and source_citations='[{"documentId":7,"quote":"Exact source"}]'::jsonb) then
    raise exception 'Slide source citations or identity were lost';
  end if;
  if not exists (select 1 from public.entity_merge_suggestions where id=1 and case_id=11
    and source_entity_id=44 and target_entity_id=55 and status='approved' and reviewed_by=22
    and reviewed_at=1770000000789 and created_at=1770000000123) then
    raise exception 'Merge-review identity or decision was lost';
  end if;
  if not exists (select 1 from public.user_feedback where id=1 and user_id=22 and case_id=11
    and feedback_type='question' and status='resolved' and current_page='/fixture'
    and pipeline_type='fixture' and message='Preserved feedback' and created_at=1770000000123) then
    raise exception 'Feedback ownership or values were lost';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name in ('presentations','presentation_slides','entity_merge_suggestions','user_feedback')
    and column_name ~ '[A-Z]') then raise exception 'Legacy workflow columns remain'; end if;
end $$;
"""

for name, fixture, section, assertions in [
    ("uuid_timestamp_patterns", pattern_fixture, helpers + patterns, pattern_assertions),
    ("quoted_workflow_columns", workflow_fixture, workflows, workflow_assertions),
]:
    query = "\n".join(["begin; set local timezone='UTC';", fixture, preflight, section, assertions,
        preflight, section, assertions, "rollback;"])
    result = subprocess.run(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60,
    )
    if result.returncode:
        raise SystemExit(f"{name}: FAIL\n{result.stderr}")
    print(f"{name}: PASS — original IDs, references, ownership, dates, values, and repeat execution")
