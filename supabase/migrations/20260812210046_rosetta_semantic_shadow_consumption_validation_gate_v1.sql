create or replace view public.rosetta_semantic_shadow_consumable
with (security_invoker = true)
as
select
  r.*,
  coalesce(d.disposition, 'ACTIVE') as effective_disposition,
  d.event_hash as effective_disposition_event_hash,
  d.effective_at as effective_disposition_at
from public.rosetta_semantic_shadow_run r
left join lateral (
  select e.disposition, e.event_hash, e.effective_at
  from public.rosetta_semantic_shadow_disposition_event e
  where e.extraction_run_id = r.extraction_run_id
    and e.parser_version = r.parser_version
    and e.effective_at <= now()
  order by e.event_seq desc
  limit 1
) d on true
where r.state = 'complete'
  and r.validation_pass = true
  and (d.disposition is null or d.disposition = 'REINSTATED')

revoke all on public.rosetta_semantic_shadow_consumable from public, anon, authenticated

grant select on public.rosetta_semantic_shadow_consumable to service_role

comment on view public.rosetta_semantic_shadow_consumable is
  'Service-role consumption boundary: completed semantic shadow runs with passing semantic validation and no effective blocking disposition, or with a later REINSTATED disposition.'
