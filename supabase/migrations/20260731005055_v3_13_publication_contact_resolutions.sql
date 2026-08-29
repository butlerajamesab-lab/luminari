begin;

create table if not exists public.luminari_resource_publication_resolutions (
  resource_entity_id uuid primary key
    references public.luminari_resource_entities(resource_entity_id),
  publication_status text not null
    check (publication_status in ('active', 'inactive')),
  display_name_override text,
  source_reference text not null,
  review_note text not null,
  review_version text not null,
  reviewed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.luminari_resource_contact_resolutions (
  contact_point_id uuid primary key
    references public.luminari_resource_contact_points(contact_point_id),
  resource_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id),
  resolution_action text not null
    check (resolution_action in ('replace', 'suppress')),
  replacement_contact_type text,
  replacement_contact_value text,
  replacement_label text,
  source_reference text not null,
  review_note text not null,
  review_version text not null,
  reviewed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (
    (
      resolution_action = 'replace'
      and replacement_contact_type is not null
      and replacement_contact_value is not null
    )
    or (
      resolution_action = 'suppress'
      and replacement_contact_type is null
      and replacement_contact_value is null
    )
  )
);

alter table public.luminari_resource_publication_resolutions
  enable row level security;
alter table public.luminari_resource_contact_resolutions
  enable row level security;

revoke all on public.luminari_resource_publication_resolutions
  from anon, authenticated;
revoke all on public.luminari_resource_contact_resolutions
  from anon, authenticated;

do $guard$
declare
  matched_contact_rows integer;
  matched_resource_rows integer;
  live_source_count bigint;
begin
  select count(*)
  into matched_contact_rows
  from (
    values
      (
        'b4162459-9b99-dc3a-df6e-66fe0944f786'::uuid,
        '26a04d4e-e7c3-d06a-2196-249897e9aea1'::uuid,
        'website',
        'https://dshs.alabama.gov/aps'
      ),
      (
        'b7c81524-7263-f147-e68a-a57c29790460'::uuid,
        '0ff7ec1f-8201-4510-9f14-e0a724288d51'::uuid,
        'website',
        'fcadv.org'
      ),
      (
        '1d03e026-44e6-30b5-5d4e-c4718e1259cd'::uuid,
        'b1596ab5-94e1-8180-fb5d-cbab408fde71'::uuid,
        'website',
        'fcadv.org'
      ),
      (
        '2d2c48e0-8348-9650-6edf-3fc25645f1ca'::uuid,
        'f4196a6e-f5ab-8c5c-d792-f02b0fe62861'::uuid,
        'website',
        'https://fcadv.org'
      ),
      (
        'dccdd264-5024-abcc-8193-4093fc09ec0c'::uuid,
        'eeb85db6-46ea-9e33-4b80-5d1949eae504'::uuid,
        'website',
        'https://www.michigan.gov/mdhhs/0,5885,7-339-71547_5527_5528---,00.html'
      ),
      (
        '76b695bc-2555-1aa2-e568-bb98b7990a0e'::uuid,
        '02653c52-ce47-cf48-d5e8-39cfb2b3012e'::uuid,
        'phone',
        '314-421-0708'
      ),
      (
        '34a1cc67-1955-ccfd-fd2a-22bed7819345'::uuid,
        '02653c52-ce47-cf48-d5e8-39cfb2b3012e'::uuid,
        'website',
        'N/A — contact directly'
      ),
      (
        'cc2e3255-0edd-f6b4-f3ac-fa8732fea0b6'::uuid,
        'f0c0f398-6949-b493-bad5-9e45ac30f4e6'::uuid,
        'phone',
        'Alliance Health (Wake/central NC): 800-510-9132 · Cardinal Innovations (Charlotte/western): 800-939-5911'
      ),
      (
        '6dca5d06-fee2-7103-8213-88d4abf2753f'::uuid,
        'f0c0f398-6949-b493-bad5-9e45ac30f4e6'::uuid,
        'website',
        'alliancehealthplan.org · cardinalinnovations.org'
      ),
      (
        'd9d09c2f-8ebd-cd6a-cb25-b252dede833d'::uuid,
        'c79f09f5-f70f-4fb2-aadb-e5ba42e616ed'::uuid,
        'website',
        'https://211.org'
      ),
      (
        'd6b2eca8-3360-0fe0-34c2-20c02c7f77e8'::uuid,
        'f7de2760-a963-03b5-b726-30e17ac2d52e'::uuid,
        'phone',
        '888-794-5556 (Wisconsin Economic Services) · dhs.wisconsin.gov/w2'
      ),
      (
        '8ed92c9a-e453-6b5e-8d38-be3671594350'::uuid,
        'f7de2760-a963-03b5-b726-30e17ac2d52e'::uuid,
        'website',
        'dhs.wisconsin.gov/w2'
      )
  ) expected(
    contact_point_id,
    resource_entity_id,
    contact_type,
    contact_value
  )
  join public.luminari_resource_contact_points actual
    on actual.contact_point_id = expected.contact_point_id
   and actual.resource_entity_id = expected.resource_entity_id
   and actual.contact_type = expected.contact_type
   and actual.contact_value = expected.contact_value;

  select count(*)
  into matched_resource_rows
  from (
    values
      (
        '26a04d4e-e7c3-d06a-2196-249897e9aea1'::uuid,
        'state_directory_logical_record'
      ),
      (
        '0ff7ec1f-8201-4510-9f14-e0a724288d51'::uuid,
        'registry_entity_staging_programs'
      ),
      (
        'b1596ab5-94e1-8180-fb5d-cbab408fde71'::uuid,
        'state_directory_logical_record'
      ),
      (
        'f4196a6e-f5ab-8c5c-d792-f02b0fe62861'::uuid,
        'state_directory_logical_record'
      ),
      (
        'eeb85db6-46ea-9e33-4b80-5d1949eae504'::uuid,
        'state_directory_logical_record'
      ),
      (
        '02653c52-ce47-cf48-d5e8-39cfb2b3012e'::uuid,
        'state_directory_logical_record'
      ),
      (
        'f0c0f398-6949-b493-bad5-9e45ac30f4e6'::uuid,
        'state_directory_logical_record'
      ),
      (
        'c79f09f5-f70f-4fb2-aadb-e5ba42e616ed'::uuid,
        'state_directory_logical_record'
      ),
      (
        'f7de2760-a963-03b5-b726-30e17ac2d52e'::uuid,
        'state_directory_logical_record'
      )
  ) expected(resource_entity_id, source_table)
  join public.luminari_resource_entities actual
    on actual.resource_entity_id = expected.resource_entity_id
   and actual.source_table = expected.source_table;

  live_source_count := matched_contact_rows + matched_resource_rows;

  if live_source_count > 0 and matched_contact_rows <> 12 then
    raise exception
      'Publication contact source guard failed: expected 12 exact contacts, found %',
      matched_contact_rows;
  end if;

  if live_source_count > 0 and matched_resource_rows <> 9 then
    raise exception
      'Publication resource source guard failed: expected 9 resources, found %',
      matched_resource_rows;
  end if;
end
$guard$;

insert into public.luminari_resource_publication_resolutions (
  resource_entity_id,
  publication_status,
  display_name_override,
  source_reference,
  review_note,
  review_version,
  reviewed_at,
  updated_at
)
select
  reviewed.resource_entity_id::uuid,
  reviewed.publication_status,
  reviewed.display_name_override,
  reviewed.source_reference,
  reviewed.review_note,
  reviewed.review_version,
  reviewed.reviewed_at::timestamptz,
  reviewed.updated_at::timestamptz
from (values
  (
    '26a04d4e-e7c3-d06a-2196-249897e9aea1',
    'active',
    'Alabama Adult Protective Services',
    'https://dhr.alabama.gov/adult-protective-services/functions-of-adult-protective-services/',
    'Publishes Alabama DHR as the current agency and retains the malformed promoted domain only in source history.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '0ff7ec1f-8201-4510-9f14-e0a724288d51',
    'active',
    'Florida Domestic Violence Hotline and Certified Centers — Housing Support',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Replaces the obsolete FCADV publication identity with Florida DCF current service language.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'b1596ab5-94e1-8180-fb5d-cbab408fde71',
    'active',
    'Florida Domestic Violence Hotline and Certified Centers — Statewide',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Replaces the obsolete FCADV publication identity with Florida DCF current service language.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'f4196a6e-f5ab-8c5c-d792-f02b0fe62861',
    'active',
    'Florida Domestic Violence Hotline (24/7)',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Suppresses the unsafe historical FCADV domain while preserving the current statewide hotline service.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'eeb85db6-46ea-9e33-4b80-5d1949eae504',
    'active',
    'Michigan Department of Health and Human Services — Statewide Navigation',
    'https://www.michigan.gov/mdhhs',
    'Replaces a path-specific legacy MDHHS title and URL with the current agency entry point.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '02653c52-ce47-cf48-d5e8-39cfb2b3012e',
    'inactive',
    'American Indian Center of Mid-America — Historical, not operating',
    'https://reflectionsnarrativesofprofessionalhelping.org/index.php/Reflections/article/download/1385/1275/',
    'The historical St. Louis organization is documented as non-operational. Public contact actions are suppressed pending a replacement resource.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'f0c0f398-6949-b493-bad5-9e45ac30f4e6',
    'active',
    'Alliance Health — North Carolina Behavioral Health',
    'https://www.alliancehealthplan.org/',
    'Removes the obsolete Cardinal Innovations identity and publishes the current Alliance Health service.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'c79f09f5-f70f-4fb2-aadb-e5ba42e616ed',
    'active',
    'Washington 211 (24/7 local referral)',
    'https://wa211.org/',
    'Uses the Washington-specific service instead of the promoted national 211 domain.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'f7de2760-a963-03b5-b726-30e17ac2d52e',
    'active',
    'Wisconsin Works (W-2) Local Agency Network',
    'https://dcf.wisconsin.gov/w2/parents/locator',
    'Uses the current Wisconsin DCF local-agency locator and removes the incorrect DHS path.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  )
) as reviewed(
  resource_entity_id,
  publication_status,
  display_name_override,
  source_reference,
  review_note,
  review_version,
  reviewed_at,
  updated_at
)
where exists (
  select 1
  from public.luminari_resource_entities entity
  where entity.resource_entity_id = reviewed.resource_entity_id::uuid
)
on conflict (resource_entity_id) do update
set
  publication_status = excluded.publication_status,
  display_name_override = excluded.display_name_override,
  source_reference = excluded.source_reference,
  review_note = excluded.review_note,
  review_version = excluded.review_version,
  reviewed_at = excluded.reviewed_at,
  updated_at = now();

insert into public.luminari_resource_contact_resolutions (
  contact_point_id,
  resource_entity_id,
  resolution_action,
  replacement_contact_type,
  replacement_contact_value,
  replacement_label,
  source_reference,
  review_note,
  review_version,
  reviewed_at,
  updated_at
)
select
  reviewed.contact_point_id::uuid,
  reviewed.resource_entity_id::uuid,
  reviewed.resolution_action,
  reviewed.replacement_contact_type,
  reviewed.replacement_contact_value,
  reviewed.replacement_label,
  reviewed.source_reference,
  reviewed.review_note,
  reviewed.review_version,
  reviewed.reviewed_at::timestamptz,
  reviewed.updated_at::timestamptz
from (values
  (
    'b4162459-9b99-dc3a-df6e-66fe0944f786',
    '26a04d4e-e7c3-d06a-2196-249897e9aea1',
    'replace',
    'website',
    'https://dhr.alabama.gov/adult-protective-services/',
    'Current official service',
    'https://dhr.alabama.gov/adult-protective-services/functions-of-adult-protective-services/',
    'The promoted dshs.alabama.gov domain is not Alabama Adult Protective Services.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'b7c81524-7263-f147-e68a-a57c29790460',
    '0ff7ec1f-8201-4510-9f14-e0a724288d51',
    'replace',
    'website',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Current official service',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'The historical FCADV domain is not safe for public circulation.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '1d03e026-44e6-30b5-5d4e-c4718e1259cd',
    'b1596ab5-94e1-8180-fb5d-cbab408fde71',
    'replace',
    'website',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Current official service',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'The historical FCADV domain is not safe for public circulation.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '2d2c48e0-8348-9650-6edf-3fc25645f1ca',
    'f4196a6e-f5ab-8c5c-d792-f02b0fe62861',
    'replace',
    'website',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'Current official service',
    'https://www.myflfamilies.com/services/abuse/domestic-violence',
    'The historical FCADV domain is not safe for public circulation.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'dccdd264-5024-abcc-8193-4093fc09ec0c',
    'eeb85db6-46ea-9e33-4b80-5d1949eae504',
    'replace',
    'website',
    'https://www.michigan.gov/mdhhs',
    'Current official service',
    'https://www.michigan.gov/mdhhs',
    'The promoted MDHHS path is a stale legacy URL.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '76b695bc-2555-1aa2-e568-bb98b7990a0e',
    '02653c52-ce47-cf48-d5e8-39cfb2b3012e',
    'suppress',
    null,
    null,
    null,
    'https://reflectionsnarrativesofprofessionalhelping.org/index.php/Reflections/article/download/1385/1275/',
    'The organization is documented as non-operational; its historical phone must not be published as a current service contact.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '34a1cc67-1955-ccfd-fd2a-22bed7819345',
    '02653c52-ce47-cf48-d5e8-39cfb2b3012e',
    'suppress',
    null,
    null,
    null,
    'https://reflectionsnarrativesofprofessionalhelping.org/index.php/Reflections/article/download/1385/1275/',
    'The placeholder contact belongs to a non-operational historical organization.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'cc2e3255-0edd-f6b4-f3ac-fa8732fea0b6',
    'f0c0f398-6949-b493-bad5-9e45ac30f4e6',
    'replace',
    'phone',
    '800-510-9132',
    'Member and recipient services',
    'https://www.alliancehealthplan.org/',
    'Removes the obsolete Cardinal Innovations phone from the compound promoted value.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '6dca5d06-fee2-7103-8213-88d4abf2753f',
    'f0c0f398-6949-b493-bad5-9e45ac30f4e6',
    'replace',
    'website',
    'https://www.alliancehealthplan.org/',
    'Current official service',
    'https://www.alliancehealthplan.org/',
    'Removes the obsolete Cardinal Innovations domain from the compound promoted value.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'd9d09c2f-8ebd-cd6a-cb25-b252dede833d',
    'c79f09f5-f70f-4fb2-aadb-e5ba42e616ed',
    'replace',
    'website',
    'https://wa211.org/',
    'Washington service',
    'https://wa211.org/',
    'Uses Washington 211 instead of the national 211 domain.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    'd6b2eca8-3360-0fe0-34c2-20c02c7f77e8',
    'f7de2760-a963-03b5-b726-30e17ac2d52e',
    'replace',
    'phone',
    '888-794-5556',
    'Wisconsin Economic Support',
    'https://dcf.wisconsin.gov/w2/parents/locator',
    'Separates the valid phone from the incorrect DHS website embedded in the promoted phone field.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  ),
  (
    '8ed92c9a-e453-6b5e-8d38-be3671594350',
    'f7de2760-a963-03b5-b726-30e17ac2d52e',
    'replace',
    'website',
    'https://dcf.wisconsin.gov/w2/parents/locator',
    'Current local-agency locator',
    'https://dcf.wisconsin.gov/w2/parents/locator',
    'Wisconsin Works is administered through DCF local agencies, not the promoted DHS path.',
    'v3_13_publication_contact_review_v1',
    '2026-07-31T02:30:00Z',
    now()
  )
) as reviewed(
  contact_point_id,
  resource_entity_id,
  resolution_action,
  replacement_contact_type,
  replacement_contact_value,
  replacement_label,
  source_reference,
  review_note,
  review_version,
  reviewed_at,
  updated_at
)
where exists (
  select 1
  from public.luminari_resource_contact_points contact
  where contact.contact_point_id = reviewed.contact_point_id::uuid
    and contact.resource_entity_id = reviewed.resource_entity_id::uuid
)
on conflict (contact_point_id) do update
set
  resource_entity_id = excluded.resource_entity_id,
  resolution_action = excluded.resolution_action,
  replacement_contact_type = excluded.replacement_contact_type,
  replacement_contact_value = excluded.replacement_contact_value,
  replacement_label = excluded.replacement_label,
  source_reference = excluded.source_reference,
  review_note = excluded.review_note,
  review_version = excluded.review_version,
  reviewed_at = excluded.reviewed_at,
  updated_at = now();

create or replace view
  public.v_luminari_resource_contact_points_current_v3_13
with (security_invoker = true)
as
select
  c.contact_point_id,
  c.resource_entity_id,
  c.canonical_id,
  case
    when r.resolution_action = 'replace'
      then r.replacement_contact_type
    else c.contact_type
  end as contact_type,
  case
    when r.resolution_action = 'replace'
      then r.replacement_contact_value
    else c.contact_value
  end as contact_value,
  case
    when r.resolution_action = 'replace'
      then coalesce(r.replacement_label, c.label)
    else c.label
  end as label,
  c.is_primary,
  case
    when r.resolution_action = 'replace'
      then 'manually_reviewed'
    else c.contact_quality
  end as contact_quality,
  c.source_table,
  c.source_pk,
  c.source_hash,
  c.metadata || case
    when r.contact_point_id is not null then jsonb_build_object(
      'publication_resolution',
      jsonb_build_object(
        'action', r.resolution_action,
        'review_version', r.review_version,
        'reviewed_at', r.reviewed_at
      )
    )
    else '{}'::jsonb
  end as metadata,
  c.created_at,
  (r.contact_point_id is not null) as manually_reviewed,
  r.source_reference as manual_source_reference,
  r.review_note as manual_review_note,
  r.review_version as manual_review_version
from public.luminari_resource_contact_points c
left join public.luminari_resource_contact_resolutions r
  on r.contact_point_id = c.contact_point_id
where coalesce(r.resolution_action, 'retain') <> 'suppress';

revoke all on public.v_luminari_resource_contact_points_current_v3_13
  from anon, authenticated;
grant select on public.v_luminari_resource_contact_points_current_v3_13
  to service_role;

do $verify$
declare
  resolution_count integer;
  current_unsafe_count integer;
  inactive_contact_count integer;
  live_source_count bigint;
begin
  select count(*)
  into resolution_count
  from public.luminari_resource_contact_resolutions
  where review_version = 'v3_13_publication_contact_review_v1';

  live_source_count := resolution_count;

  if live_source_count > 0 and resolution_count <> 12 then
    raise exception
      'Expected 12 publication contact resolutions, found %',
      resolution_count;
  end if;

  select count(*)
  into current_unsafe_count
  from public.v_luminari_resource_contact_points_current_v3_13
  where lower(contact_value) like '%fcadv.org%'
     or lower(contact_value) like '%cardinalinnovations.org%'
     or lower(contact_value) like '%dshs.alabama.gov%'
     or lower(contact_value) like '%dhs.wisconsin.gov/w2%';

  if current_unsafe_count <> 0 then
    raise exception
      'Unsafe or obsolete contacts remain in current publication view: %',
      current_unsafe_count;
  end if;

  select count(*)
  into inactive_contact_count
  from public.v_luminari_resource_contact_points_current_v3_13 c
  join public.luminari_resource_publication_resolutions p
    on p.resource_entity_id = c.resource_entity_id
  where p.publication_status = 'inactive';

  if inactive_contact_count <> 0 then
    raise exception
      'Inactive publication still has current contact rows: %',
      inactive_contact_count;
  end if;

  if live_source_count = 0 and resolution_count <> 0 then
    raise exception
      'Publication contact resolutions were written without source resources';
  end if;
end
$verify$;

commit;
