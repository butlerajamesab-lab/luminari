-- Operational Core Namespace Activation Foundation
-- Reconstruction Branch Alignment
-- Date: 2026-05-11

create table if not exists namespace_activation_registry (
  id uuid primary key default gen_random_uuid(),
  namespace_key text unique not null,
  activation_status text not null,
  activation_classification text not null,
  layer_owner text,
  runtime_notes text,
  created_at timestamptz not null default now()
);

insert into namespace_activation_registry (
  namespace_key,
  activation_status,
  activation_classification,
  layer_owner,
  runtime_notes
)
values
('governance','ready','SAFE_TO_ACTIVATE','L10','Operational-core governance visibility'),
('mission-control','ready','SAFE_TO_ACTIVATE','L10','Operational oversight visibility'),
('legal-library','ready','SAFE_TO_ACTIVATE','L3','Legal backbone visibility'),
('knowledge-backbone','ready','SAFE_TO_ACTIVATE','L3','Registry and doctrine visibility'),
('civil-gideon','ready','SAFE_TO_ACTIVATE','L3','Resource backbone visibility'),
('agency-metrics','ready','SAFE_TO_ACTIVATE','L3','Agency/resource metrics visibility'),
('signal-governance','ready','SAFE_TO_ACTIVATE','L6','Signal oversight visibility'),
('pattern-registry','ready','SAFE_TO_ACTIVATE','L6','Pattern visibility'),
('civic-map','ready','SAFE_TO_ACTIVATE','L11','Operational civic visibility')
on conflict (namespace_key) do nothing;

alter table namespace_activation_registry enable row level security;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'namespace_activation_registry'
      and policyname = 'namespace_activation_registry_public_read'
  ) then
    create policy namespace_activation_registry_public_read
      on namespace_activation_registry
      for select
      using (true);
  end if;
end
$policy$;
