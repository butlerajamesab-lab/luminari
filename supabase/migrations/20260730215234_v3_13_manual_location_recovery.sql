-- Recover locations for the 64 v3.13 resources whose source rows carried
-- office-labelled addresses rather than a literal `address` field.
--
-- This is intentionally bounded by a hand-reviewed logical-record allowlist.
-- It does not reclassify the wider corpus and it never upgrades verification
-- or coordinate quality.

create temporary table tmp_sdr_manual_location_allowlist (
  logical_record_id text primary key
) on commit drop;

insert into tmp_sdr_manual_location_allowlist (logical_record_id)
values
  ('sdl_aecc403f3af0cdaba437f5616cfbd1ba'),
  ('sdl_ddebbd5385bdfcec0197403d54b5ba24'),
  ('sdl_bbee2d01add2fc06bfdf1e5563139580'),
  ('sdl_3f73ebe87ad4064fa408fbddfd7f590e'),
  ('sdl_907056b07859f55867dea0f75da097f0'),
  ('sdl_115303fe647f8d6a438b0b8e2611c239'),
  ('sdl_945f0e60ba4904711e559b04dfd88f04'),
  ('sdl_ff89f661c6f65af97d89c13c40a47861'),
  ('sdl_aaebc5b50554d51f0c4571db9ca71ca0'),
  ('sdl_f7291e60f0340dc2d5a61e4e4381c000'),
  ('sdl_442e7964b097e88e94ad4ded3d2dd6a6'),
  ('sdl_1e1ec9abae05235a77482258d27c5a46'),
  ('sdl_d2234bbeb9019ba53af00e69a0d62868'),
  ('sdl_a1d572d8bbb82818c2ff3b4c145e85c1'),
  ('sdl_b04518d41d4af5691cd409fb4b37dc3e'),
  ('sdl_e22bde87bbc0b73c384b000c126505c0'),
  ('sdl_a57678a7e825f01922d1c0a09597ff18'),
  ('sdl_1ae11f52f21d06aa561ab1a8678de2c4'),
  ('sdl_77c5e247963e44697746dceb5ea3ccac'),
  ('sdl_9efc1fc0a0954ac4b3670b951fb469bf'),
  ('sdl_ab2c8f03097666f3fc512670fa5e92bb'),
  ('sdl_bc42d0df090451fe3251e0de6fb90c49'),
  ('sdl_9989b3065e73d8d8115ab7072a3654c6'),
  ('sdl_ae9d03ff43c2679d5b5cf2bc7d1acc8b'),
  ('sdl_38bf268e865e74738116dc8a2160c385'),
  ('sdl_8d79f79b47d79e146688daafc93d79c0'),
  ('sdl_a1736c604eb76b41e210ace56b90b2c5'),
  ('sdl_8eef55cc518149ffef142bb139107206'),
  ('sdl_1a5d693a74384192b26dfd45d8ea232f'),
  ('sdl_62bae01fd8891152a54e40cef6bcda94'),
  ('sdl_9c9c4d05495c72e4090d0223bed0f4f2'),
  ('sdl_07846dc1f765f276505033c4476f0dbf'),
  ('sdl_7fba365e83997112f62b85ff90e4443c'),
  ('sdl_dc5a62f02576db872b6ed4473d37bc23'),
  ('sdl_466a0bc7c69be190f185d44d5855e093'),
  ('sdl_cbcd4d611a76dc4dcf7da071a112ce86'),
  ('sdl_5a259418d7889699c96071659a416f74'),
  ('sdl_64eed5cca701e9b290306f9e22a95b19'),
  ('sdl_d6f764ce01ce9977831c31aadf2afc0b'),
  ('sdl_6e7667ae9fdf37c9c09cde9c6b463e98'),
  ('sdl_b4a53a2cb486a8da3654b9681c6b3515'),
  ('sdl_2fecd9b934e91fd020ca0dc3d642788f'),
  ('sdl_d18fe5e0e7d0af39b92087169601b793'),
  ('sdl_93863e6c36696bedc322331bf819581d'),
  ('sdl_258b2f7a6714fe3e2c22bc01f70a7423'),
  ('sdl_b453aebc3bf8b2b769a4c5c9ee19a64d'),
  ('sdl_ee18b12372982bedc3f46cde4b65188e'),
  ('sdl_7ed4039605c2eea99fe6f1ae2ebf5cdd'),
  ('sdl_6a8ef08be817028e9804795c110a0e8f'),
  ('sdl_a1e94f4967e806ee0f6b4f00af49d378'),
  ('sdl_fed6867258e25543e46aecd643144549'),
  ('sdl_fca4488b9a3acd026a47b66efee2de71'),
  ('sdl_80c435eb70366d7e59f7256880e3ed30'),
  ('sdl_d8ff677634dc1369b31176042c620a93'),
  ('sdl_878367c2dbcc35df88ff09c7f5906baf'),
  ('sdl_ef473634d59465f487a6c4dd27d3106f'),
  ('sdl_d235e9616ce80ff9938ef206569ffeaf'),
  ('sdl_595b413368fecacd6739ef35d8726c09'),
  ('sdl_7ab5ab76c3cb885c5d75226c35d3d3d0'),
  ('sdl_98ce1a961ec6e3fb5018143a90148ee1'),
  ('sdl_abafae0d5b5e7fcae197d529f302c434'),
  ('sdl_f595a25b38401723b70c74da58433f31'),
  ('sdl_fb5d7fba74080854a9b641e9c5c964b6'),
  ('sdl_cb0b5285850c7cc384e0a57306018868');

create temporary table tmp_sdr_manual_location_source on commit drop as
select
  e.resource_entity_id,
  e.canonical_id,
  e.resource_name,
  e.state as jurisdiction_state,
  e.source_pk as logical_record_id,
  lr.source_file,
  r.ordinality::integer as source_row_ordinality,
  nullif(btrim(r.row_payload->>'service_type'), '') as source_label,
  (
    select v.value
    from jsonb_each_text(r.row_payload) v(key, value)
    where v.key <> 'service_type'
    limit 1
  ) as raw_source_value
from tmp_sdr_manual_location_allowlist a
join public.luminari_resource_entities e
  on e.source_pk = a.logical_record_id
 and e.source_table = 'state_directory_logical_record'
join public.state_directory_logical_record lr
  on lr.logical_record_id = a.logical_record_id
cross join lateral jsonb_array_elements(lr.normalized_payload->'rows')
  with ordinality as r(row_payload, ordinality);

create temporary table tmp_sdr_manual_location_segments on commit drop as
select
  s.*,
  x.ordinality::integer as source_segment_ordinality,
  btrim(x.segment) as source_segment
from tmp_sdr_manual_location_source s
cross join lateral regexp_split_to_table(
  s.raw_source_value,
  '\s*[│|]\s*'
) with ordinality as x(segment, ordinality);

create temporary table tmp_sdr_manual_locations on commit drop as
with address_occurrences as (
  select
    s.*,
    btrim(regexp_replace(
      case
        when s.source_label ilike '%key offices%'
          then regexp_replace(s.source_segment, '^[^:]+:\s*', '')
        else s.source_segment
      end,
      '\s*\([^)]*\)\s*$',
      ''
    )) as address_text
  from tmp_sdr_manual_location_segments s
  where s.source_segment ~ '\m[A-Z]{2}[ ,]+[0-9]{5}(-[0-9]{4})?\M'
),
grouped as (
  select
    resource_entity_id,
    canonical_id,
    resource_name,
    jurisdiction_state,
    logical_record_id,
    source_file,
    address_text,
    substring(
      address_text from '\m([A-Z]{2})[ ,]+[0-9]{5}(-[0-9]{4})?\M'
    ) as physical_state,
    substring(
      address_text from '\m[A-Z]{2}[ ,]+([0-9]{5}(-[0-9]{4})?)\M'
    ) as postal_code,
    array_agg(source_label order by source_row_ordinality)
      as source_labels,
    jsonb_agg(
      jsonb_build_object(
        'source_row_ordinality', source_row_ordinality,
        'source_segment_ordinality', source_segment_ordinality,
        'source_label', source_label,
        'raw_source_value', raw_source_value,
        'source_segment', source_segment
      )
      order by source_row_ordinality, source_segment_ordinality
    ) as source_occurrences
  from address_occurrences
  group by
    resource_entity_id,
    canonical_id,
    resource_name,
    jurisdiction_state,
    logical_record_id,
    source_file,
    address_text
)
select
  public.luminari_stable_uuid_v1(
    'state_directory_manual_location_recovery_v1|' ||
    resource_entity_id::text || '|' || md5(address_text)
  ) as location_id,
  *,
  case
    when exists (
      select 1 from unnest(source_labels) label
      where label ilike '%mailing%'
    ) then 'mailing'
    when address_text ~* 'P\.?\s*O\.?\s*Box'
      then 'combined_physical_and_mailing_source'
    else 'office'
  end as location_kind
from grouped;

do $guard$
declare
  allowlisted_records integer;
  matched_resources integer;
  address_occurrences integer;
  distinct_locations integer;
  covered_resources integer;
begin
  select count(*) into allowlisted_records
  from tmp_sdr_manual_location_allowlist;

  select count(distinct resource_entity_id) into matched_resources
  from tmp_sdr_manual_location_source;

  select count(*) into address_occurrences
  from tmp_sdr_manual_location_segments
  where source_segment ~ '\m[A-Z]{2}[ ,]+[0-9]{5}(-[0-9]{4})?\M';

  select count(*), count(distinct resource_entity_id)
    into distinct_locations, covered_resources
  from tmp_sdr_manual_locations;

  if allowlisted_records <> 64 then
    raise exception
      'manual location recovery allowlist drift: expected 64, found %',
      allowlisted_records;
  end if;

  if matched_resources <> 64 then
    raise exception
      'manual location recovery entity match drift: expected 64, found %',
      matched_resources;
  end if;

  if address_occurrences <> 196 then
    raise exception
      'manual location recovery source occurrence drift: expected 196, found %',
      address_occurrences;
  end if;

  if distinct_locations <> 195 then
    raise exception
      'manual location recovery distinct location drift: expected 195, found %',
      distinct_locations;
  end if;

  if covered_resources <> 64 then
    raise exception
      'manual location recovery coverage drift: expected 64, found %',
      covered_resources;
  end if;
end
$guard$;

insert into public.luminari_resource_locations (
  location_id,
  resource_entity_id,
  address_line1,
  state,
  country,
  coordinate_quality,
  source_table,
  source_pk,
  metadata,
  created_at
)
select
  m.location_id,
  m.resource_entity_id,
  m.address_text,
  coalesce(m.physical_state, m.jurisdiction_state),
  'US',
  'source_attached_ungeocoded',
  'state_directory_logical_record',
  m.logical_record_id,
  jsonb_build_object(
    'recovery_engine', 'state_directory_manual_location_recovery',
    'recovery_version', '1.0.0',
    'manual_reviewed', true,
    'reassembly_run_id', 'state_directory_reassembly_v1_20260729',
    'logical_record_id', m.logical_record_id,
    'source_file', m.source_file,
    'resource_canonical_id', m.canonical_id,
    'resource_name', m.resource_name,
    'source_labels', to_jsonb(m.source_labels),
    'source_occurrences', m.source_occurrences,
    'location_kind', m.location_kind,
    'physical_state', m.physical_state,
    'postal_code_from_source', m.postal_code,
    'verification_preserved', true,
    'coordinates_asserted', false
  ),
  now()
from tmp_sdr_manual_locations m
on conflict (location_id) do update set
  address_line1 = coalesce(
    nullif(public.luminari_resource_locations.address_line1, ''),
    excluded.address_line1
  ),
  state = coalesce(
    nullif(public.luminari_resource_locations.state, ''),
    excluded.state
  ),
  country = coalesce(
    nullif(public.luminari_resource_locations.country, ''),
    excluded.country
  ),
  metadata = coalesce(
    public.luminari_resource_locations.metadata,
    '{}'::jsonb
  ) || excluded.metadata;

with recovered as (
  select
    resource_entity_id,
    count(*)::integer as recovered_location_count
  from tmp_sdr_manual_locations
  group by resource_entity_id
)
update public.luminari_resource_entities e
set
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
    'manual_location_recovery',
    jsonb_build_object(
      'engine_id', 'state_directory_manual_location_recovery',
      'engine_version', '1.0.0',
      'recovered_location_count', r.recovered_location_count,
      'source_reviewed', true,
      'coordinates_asserted', false
    )
  ),
  updated_at = now()
from recovered r
where e.resource_entity_id = r.resource_entity_id;

do $acceptance$
declare
  recovered_locations integer;
  recovered_resources integer;
  uncovered_resources integer;
begin
  select
    count(*)::integer,
    count(distinct resource_entity_id)::integer
    into recovered_locations, recovered_resources
  from public.luminari_resource_locations
  where metadata->>'recovery_engine' =
    'state_directory_manual_location_recovery'
    and metadata->>'recovery_version' = '1.0.0';

  select count(*)::integer into uncovered_resources
  from tmp_sdr_manual_location_allowlist a
  join public.luminari_resource_entities e
    on e.source_pk = a.logical_record_id
   and e.source_table = 'state_directory_logical_record'
  where not exists (
    select 1
    from public.luminari_resource_locations l
    where l.resource_entity_id = e.resource_entity_id
      and nullif(btrim(l.address_line1), '') is not null
  );

  if recovered_locations <> 195 then
    raise exception
      'manual location recovery write drift: expected 195, found %',
      recovered_locations;
  end if;

  if recovered_resources <> 64 then
    raise exception
      'manual location recovery resource drift: expected 64, found %',
      recovered_resources;
  end if;

  if uncovered_resources <> 0 then
    raise exception
      'manual location recovery incomplete: % allowlisted resources remain uncovered',
      uncovered_resources;
  end if;
end
$acceptance$;
