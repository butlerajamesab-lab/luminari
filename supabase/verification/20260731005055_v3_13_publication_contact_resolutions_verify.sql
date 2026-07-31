select
  count(*)::int as publication_resolution_rows,
  count(*) filter (where publication_status = 'active')::int
    as active_publication_resolutions,
  count(*) filter (where publication_status = 'inactive')::int
    as inactive_publication_resolutions
from public.luminari_resource_publication_resolutions
where review_version = 'v3_13_publication_contact_review_v1';

select
  count(*)::int as contact_resolution_rows,
  count(*) filter (where resolution_action = 'replace')::int
    as replacement_rows,
  count(*) filter (where resolution_action = 'suppress')::int
    as suppressed_rows
from public.luminari_resource_contact_resolutions
where review_version = 'v3_13_publication_contact_review_v1';

select count(*)::int as unsafe_current_contact_rows
from public.v_luminari_resource_contact_points_current_v3_13
where lower(contact_value) like '%fcadv.org%'
   or lower(contact_value) like '%cardinalinnovations.org%'
   or lower(contact_value) like '%dshs.alabama.gov%'
   or lower(contact_value) like '%dhs.wisconsin.gov/w2%';

select
  count(distinct e.resource_entity_id)::int as corpus_resources,
  count(distinct e.state)::int as jurisdictions,
  count(distinct c.resource_entity_id)::int as resources_with_current_contacts
from public.luminari_resource_entities e
left join public.v_luminari_resource_contact_points_current_v3_13 c
  on c.resource_entity_id = e.resource_entity_id
where e.source_table = 'state_directory_logical_record';
