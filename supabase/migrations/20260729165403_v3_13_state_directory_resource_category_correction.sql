begin;

create or replace function public.state_directory_resource_category(p_identity text)
returns text
language sql
immutable
strict
as $$
  select case
    when p_identity ~ '(snap|wic|food|nutrition|meal)' then 'food_nutrition'
    when p_identity ~ '(tanf|temporaryassistance|cashassistance|generalassistance|familyassistance)' then 'cash_assistance'
    when p_identity ~ '(domesticviolence|violence|dv|crisis|sexualassault)' then 'safety_crisis'
    when p_identity ~ '(housing|hud|shelter|tenant|rent|homeless)' then 'housing'
    when p_identity ~ '(legal|lawyer|attorney|bar|civilrights|eeoc|humanrights)' then 'legal_civil_rights'
    when p_identity ~ '(unemployment|labor|wage|employment|workforce|dol)' then 'employment_labor'
    when p_identity ~ '(liheap|utility|energy|heating)' then 'utilities'
    when p_identity ~ '(disability|ssdi|supplementalsecurityincome|vocationalrehabilitation|rehabilitationservices|protectionandadvocacy)' then 'disability'
    when p_identity ~ '(veteran|veteransservices|veteransaffairs)' then 'veterans'
    when p_identity ~ '(medicaid|health|medical|hospital|clinic|fqhc|mental|behavioral|substance)' then 'healthcare'
    when p_identity ~ '(tribe|tribal|native|ihs|indian|bia|ancsa)' then 'tribal'
    else 'general_resource'
  end;
$$;

with corrected as (
  select
    resource_entity_id,
    public.state_directory_resource_category(lower(metadata->>'original_identity')) as corrected_category
  from public.luminari_resource_entities
  where source_table = 'state_directory_logical_record'
    and nullif(metadata->>'original_identity', '') is not null
)
update public.luminari_resource_entities e
set
  resource_category = c.corrected_category,
  service_categories = array[c.corrected_category]::text[],
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
    'resource_category_engine', 'state_directory_resource_category',
    'resource_category_engine_version', '1.0.1'
  ),
  updated_at = now()
from corrected c
where e.resource_entity_id = c.resource_entity_id
  and (
    e.resource_category is distinct from c.corrected_category
    or e.service_categories is distinct from array[c.corrected_category]::text[]
  );

comment on function public.state_directory_resource_category(text) is
  'Deterministic primary-category classifier for state-directory resource identities. Uses explicit domain terms and deliberately avoids bare SSI substring matching inside words such as assistance.';

commit;
