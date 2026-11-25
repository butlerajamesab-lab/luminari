-- Tribal government offices in the catalog (Find an Office "Tribal Governments").
--
-- Source: the BIA Tribal Leaders Directory snapshot already preserved in
-- public.tribal_leadership_snapshot_v1 (weekly pull, #898). Each federally
-- recognized nation's tribal office becomes one gov_offices row
-- (agency_key 'tribal_government'), then enters the catalog by the same
-- rules as scripts/project-gov-offices.mjs (gov_office_projection_v1):
--   - entity id luminari_stable_uuid_v1('gov_office:' || office_id),
--     canonical_id = office_id, category 'tribal';
--   - tier A: same state + ZIP5 + normalized street as an existing catalog
--     location => link to that entity (tier_a_merge), no new entity;
--   - tier B: same normalized name + state + city as an existing entity
--     without a tier A match => held (not projected; listed by the query at
--     the end of this file);
--   - coordinates copied only as the source gives them (source_supplied).
-- Only the nation's office fields are carried: name, address, phone, website,
-- coordinates. No leader names or emails. Nothing existing is updated or
-- deleted. Re-runnable: every insert is conflict-guarded.

insert into public.locator_sources
  (source_id, agency_key, tier, endpoint_url, endpoint_type, auth, license,
   coverage_claim, coverage_verified, update_cadence, last_fetched_at, last_hash8, status)
values
  ('bia_tribal_leaders_directory', 'tribal_government', 1,
   'https://services1.arcgis.com/UxqqIfhng71wUT9x/arcgis/rest/services/TribalLeadership_Directory/FeatureServer/0',
   'arcgis', 'none', 'public-domain',
   'BIA Tribal Leaders Directory: tribal office of each federally recognized nation (602 records in the 2026-11-24 pull)',
   true, 'weekly (Lighthouse refresh)', now(), null, 'active')
on conflict (source_id) do nothing;

with latest as (
  select snapshot_id
    from public.tribal_leadership_snapshot_v1
   group by snapshot_id
   order by max(captured_date) desc, snapshot_id desc
   limit 1
),
state_codes(state_name, state_code) as (
  values ('Alabama','AL'),('Alaska','AK'),('Arizona','AZ'),('Arkansas','AR'),('California','CA'),
         ('Colorado','CO'),('Connecticut','CT'),('Delaware','DE'),('District of Columbia','DC'),
         ('Florida','FL'),('Georgia','GA'),('Hawaii','HI'),('Idaho','ID'),('Illinois','IL'),
         ('Indiana','IN'),('Iowa','IA'),('Kansas','KS'),('Kentucky','KY'),('Louisiana','LA'),
         ('Maine','ME'),('Maryland','MD'),('Massachusetts','MA'),('Michigan','MI'),('Minnesota','MN'),
         ('Mississippi','MS'),('Missouri','MO'),('Montana','MT'),('Nebraska','NE'),('Nevada','NV'),
         ('New Hampshire','NH'),('New Jersey','NJ'),('New Mexico','NM'),('New York','NY'),
         ('North Carolina','NC'),('North Dakota','ND'),('Ohio','OH'),('Oklahoma','OK'),('Oregon','OR'),
         ('Pennsylvania','PA'),('Rhode Island','RI'),('South Carolina','SC'),('South Dakota','SD'),
         ('Tennessee','TN'),('Texas','TX'),('Utah','UT'),('Vermont','VT'),('Virginia','VA'),
         ('Washington','WA'),('West Virginia','WV'),('Wisconsin','WI'),('Wyoming','WY')
),
source_rows as (
  select s.snapshot_id, s.record,
         'gof_' || substr(md5('bia_tld_tribal_office:' || (s.record ->> 'GlobalID')), 1, 20) as office_id,
         nullif(btrim(s.record ->> 'tribefullname'), '') as office_name,
         sc.state_code,
         nullif(btrim(s.record ->> 'city'), '') as city,
         nullif(btrim(s.record ->> 'physicaladdress'), '') as street,
         substring(btrim(coalesce(s.record ->> 'zipcode', '')) from '^[0-9]{5}') as zip5,
         nullif(btrim(s.record ->> 'phone'), '') as phone,
         nullif(btrim(s.record ->> 'website'), '') as website,
         (s.record ->> 'latitude')::numeric as lat,
         (s.record ->> 'longitude')::numeric as lng
    from public.tribal_leadership_snapshot_v1 s
    join latest using (snapshot_id)
    left join state_codes sc on sc.state_name = btrim(s.record ->> 'state')
   where nullif(btrim(s.record ->> 'GlobalID'), '') is not null
     and nullif(btrim(s.record ->> 'tribefullname'), '') is not null
)
insert into public.gov_offices
  (office_id, agency_key, office_name, office_type, state, city, address_full,
   phone_raw, url, lat, lng, source_id, source_hash8, provenance)
select office_id, 'tribal_government', office_name, 'tribal_office', state_code, city,
       nullif(concat_ws(', ', street, city, nullif(concat_ws(' ', state_code, zip5), '')), ''),
       phone, website, lat, lng, 'bia_tribal_leaders_directory',
       left(md5(record::text), 8),
       '[src: BIA Tribal Leaders Directory (ArcGIS TribalLeadership_Directory), snapshot '
         || snapshot_id || ', GlobalID ' || (record ->> 'GlobalID') || ']'
  from source_rows
on conflict (office_id) do nothing;

-- Project into the catalog by the gov_office_projection_v1 rules.
create temporary table tribal_office_projection_plan on commit drop as
with offices as (
  -- address_full is "street, city, ST ZIP" when BIA gives a street and
  -- "city, ST ZIP" when it does not: only a three-part address has a street.
  select g.*,
         case when array_length(string_to_array(g.address_full, ','), 1) >= 3 then
           nullif(btrim(regexp_replace(regexp_replace(lower(
             split_part(g.address_full, ',', 1)), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')), '')
         end as street_key,
         substring(g.address_full from '([0-9]{5})(-[0-9]{4})?\s*$') as zip5,
         case when array_length(string_to_array(g.address_full, ','), 1) >= 3 then
           nullif(btrim(split_part(g.address_full, ',', 1)), '')
         end as street,
         btrim(regexp_replace(regexp_replace(lower(g.office_name), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) as name_key,
         btrim(regexp_replace(regexp_replace(lower(coalesce(g.city, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) as city_key
    from public.gov_offices g
   where g.agency_key = 'tribal_government'
     and g.superseded_by is null
     and not exists (select 1 from public.luminari_anchor_office_source_rows a where a.office_id = g.office_id)
),
tier_a as (
  select distinct on (o.office_id) o.office_id, l.resource_entity_id as target_entity_id
    from offices o
    join public.luminari_resource_locations l
      on l.address_line1 is not null
     and upper(btrim(l.state)) = o.state
     and substring(coalesce(l.postal_code, '') from '^[0-9]{5}') = o.zip5
     and btrim(regexp_replace(regexp_replace(lower(l.address_line1), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) = o.street_key
   where o.street_key is not null and o.zip5 is not null
   order by o.office_id, l.resource_entity_id
),
tier_b as (
  select distinct o.office_id
    from offices o
    join public.luminari_resource_entities e
      on upper(btrim(e.state)) = o.state
     and btrim(regexp_replace(regexp_replace(lower(coalesce(e.city, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) = o.city_key
     and btrim(regexp_replace(regexp_replace(lower(e.resource_name), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) = o.name_key
   where o.city_key <> '' and o.name_key <> ''
     and not exists (select 1 from tier_a ta where ta.office_id = o.office_id)
)
select o.*,
       case when ta.office_id is not null then 'tier_a_merge'
            when tb.office_id is not null then 'tier_b_held'
            else 'minted' end as plan,
       coalesce(ta.target_entity_id, public.luminari_stable_uuid_v1('gov_office:' || o.office_id)) as entity_id
  from offices o
  left join tier_a ta on ta.office_id = o.office_id
  left join tier_b tb on tb.office_id = o.office_id;

insert into public.luminari_resource_entities
  (resource_entity_id, canonical_id, source_family_key, source_table, source_pk, source_hash,
   resource_name, resource_type, resource_category, service_categories, layer, jurisdiction,
   state, county, city, verification_status, promotion_status, provenance_status, metadata)
select p.entity_id, p.office_id, 'gov_office_projection', 'gov_office_projection_v1', p.office_id,
       p.source_hash8, p.office_name, p.office_type, 'tribal', array[]::text[], null, null,
       p.state, p.county, p.city, 'source_attached', 'review_ready', 'staging_provenance_attached',
       jsonb_build_object(
         'projection_version', 'gov_office_projection_v1',
         'category_rule', 'u1_family_map_v1',
         'agency_key', p.agency_key,
         'office_type', p.office_type,
         'source_id', p.source_id,
         'source_hash8', p.source_hash8,
         'source_provenance', p.provenance)
  from tribal_office_projection_plan p
 where p.plan = 'minted'
on conflict (canonical_id) do nothing;

insert into public.luminari_resource_locations
  (resource_entity_id, address_line1, address_line2, city, county, state, postal_code, country,
   latitude, longitude, coordinate_quality, geocode_source, source_table, source_pk, metadata)
select p.entity_id, p.street, null, p.city, p.county, p.state, p.zip5, 'US',
       p.lat, p.lng,
       case when p.lat is not null and p.lng is not null then 'source_supplied' else 'not_geocoded_projection' end,
       case when p.lat is not null and p.lng is not null then p.source_id end,
       'gov_office_projection_v1', p.office_id,
       jsonb_build_object('projection_version', 'gov_office_projection_v1',
                          'office_id', p.office_id, 'agency_key', p.agency_key)
  from tribal_office_projection_plan p
 where p.plan = 'minted'
   and not exists (
     select 1 from public.luminari_resource_locations existing
      where existing.source_table = 'gov_office_projection_v1' and existing.source_pk = p.office_id);

insert into public.luminari_anchor_office_source_rows
  (office_id, resource_entity_id, match_kind, projection_version)
select p.office_id, p.entity_id, p.plan, 'gov_office_projection_v1'
  from tribal_office_projection_plan p
 where p.plan in ('minted', 'tier_a_merge')
on conflict (office_id) do nothing;
