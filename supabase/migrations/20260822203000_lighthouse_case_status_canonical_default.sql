-- Keep Lighthouse case state on the existing canonical cases.status lane.
-- Intake sessions already begin as open/started; the legacy case projection
-- must be initialized in the same transaction instead of inventing a second
-- status source in the read model.

alter table public.cases
  alter column status set default 'active';

update public.cases c
   set status = 'active'
 where c.status is null
   and exists (
     select 1
       from public.case_identity_bridge b
       join public.case_intake_links l
         on l.case_uuid = b.case_uuid
        and l.is_primary is true
        and l.link_type = 'primary_projection'
      where b.legacy_case_id = c.id
   );

comment on column public.cases.status is
  'Canonical Lighthouse case lifecycle state. New case/intake projections begin active; downstream read models project this column directly.';
