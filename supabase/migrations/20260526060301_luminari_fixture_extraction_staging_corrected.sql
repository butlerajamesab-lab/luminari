begin;

create table if not exists public.luminari_fixture_extraction_runs (
  extraction_run_id uuid primary key default gen_random_uuid(),
  run_label text not null,
  fixture_key text references public.luminari_registry_fixture_plan(fixture_key),
  family_key text references public.luminari_document_family_contracts(family_key),
  source_document_name text not null,
  parser_version text,
  run_status text not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_fixture_extracted_objects (
  extracted_object_id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid references public.luminari_fixture_extraction_runs(extraction_run_id) on delete cascade,
  fixture_key text references public.luminari_registry_fixture_plan(fixture_key),
  family_key text references public.luminari_document_family_contracts(family_key),
  object_class text not null,
  object_key text,
  display_name text,
  jurisdiction text,
  parent_object_key text,
  payload jsonb not null default '{}'::jsonb,
  source_section text,
  source_heading text,
  source_page integer,
  source_text text,
  source_hash text,
  extraction_confidence numeric(4,3),
  validation_status text not null default 'pending',
  blockers text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_fixture_object_links (
  object_link_id uuid primary key default gen_random_uuid(),
  extraction_run_id uuid references public.luminari_fixture_extraction_runs(extraction_run_id) on delete cascade,
  fixture_key text references public.luminari_registry_fixture_plan(fixture_key),
  source_object_key text not null,
  target_object_key text not null,
  link_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_fixture_expected_counts (
  expectation_id uuid primary key default gen_random_uuid(),
  fixture_key text references public.luminari_registry_fixture_plan(fixture_key),
  family_key text references public.luminari_document_family_contracts(family_key),
  object_class text not null,
  minimum_expected_count integer not null default 1,
  expectation_source text not null default 'family_contract',
  notes text,
  created_at timestamptz not null default now(),
  unique (fixture_key, object_class)
);

insert into public.luminari_fixture_expected_counts (
  fixture_key,
  family_key,
  object_class,
  minimum_expected_count,
  expectation_source,
  notes
)
select
  fp.fixture_key,
  fp.family_key,
  expected.object_class,
  1 as minimum_expected_count,
  'fixture_plan',
  'Auto-seeded from fixture expected object classes.'
from public.luminari_registry_fixture_plan fp
cross join lateral unnest(fp.expected_object_classes) as expected(object_class)
on conflict (fixture_key, object_class) do update set
  family_key = excluded.family_key,
  minimum_expected_count = excluded.minimum_expected_count,
  expectation_source = excluded.expectation_source,
  notes = excluded.notes;

create index if not exists idx_luminari_fixture_extracted_objects_fixture_class
  on public.luminari_fixture_extracted_objects(fixture_key, object_class);

create index if not exists idx_luminari_fixture_extracted_objects_run
  on public.luminari_fixture_extracted_objects(extraction_run_id);

create index if not exists idx_luminari_fixture_object_links_fixture
  on public.luminari_fixture_object_links(fixture_key, link_type);

create or replace view public.v_luminari_fixture_extraction_scorecard as
with expected as (
  select fixture_key, family_key, object_class, minimum_expected_count
  from public.luminari_fixture_expected_counts
), actual as (
  select
    fixture_key,
    family_key,
    object_class,
    count(*) as extracted_count,
    count(*) filter (where validation_status = 'pass') as passed_count,
    count(*) filter (where validation_status = 'fail') as failed_count,
    count(*) filter (where array_length(blockers, 1) is not null) as blocked_count
  from public.luminari_fixture_extracted_objects
  group by fixture_key, family_key, object_class
)
select
  e.fixture_key,
  fp.document_name,
  e.family_key,
  e.object_class,
  e.minimum_expected_count,
  coalesce(a.extracted_count, 0) as extracted_count,
  coalesce(a.passed_count, 0) as passed_count,
  coalesce(a.failed_count, 0) as failed_count,
  coalesce(a.blocked_count, 0) as blocked_count,
  case
    when coalesce(a.extracted_count,0) >= e.minimum_expected_count then 'present'
    else 'missing_or_under_minimum'
  end as completeness_status
from expected e
join public.luminari_registry_fixture_plan fp on fp.fixture_key = e.fixture_key
left join actual a on a.fixture_key = e.fixture_key and a.object_class = e.object_class
order by fp.fixture_role, fp.document_name, e.object_class;

create or replace view public.v_luminari_fixture_run_summary as
select
  fp.fixture_role,
  fp.fixture_key,
  fp.document_name,
  fp.family_key,
  count(distinct ec.object_class) as expected_classes,
  count(distinct ec.object_class) filter (
    where exists (
      select 1 from public.luminari_fixture_extracted_objects eo
      where eo.fixture_key = fp.fixture_key
        and eo.object_class = ec.object_class
    )
  ) as classes_with_output,
  count(distinct ec.object_class) filter (
    where not exists (
      select 1 from public.luminari_fixture_extracted_objects eo
      where eo.fixture_key = fp.fixture_key
        and eo.object_class = ec.object_class
    )
  ) as classes_missing_output,
  count(distinct eo.extracted_object_id) as total_extracted_objects
from public.luminari_registry_fixture_plan fp
left join public.luminari_fixture_expected_counts ec on ec.fixture_key = fp.fixture_key
left join public.luminari_fixture_extracted_objects eo on eo.fixture_key = fp.fixture_key
group by fp.fixture_role, fp.fixture_key, fp.document_name, fp.family_key
order by fp.fixture_role, fp.document_name;

create or replace view public.v_luminari_fixture_missing_required_classes as
select *
from public.v_luminari_fixture_extraction_scorecard
where completeness_status = 'missing_or_under_minimum'
order by fixture_key, object_class;

commit;
