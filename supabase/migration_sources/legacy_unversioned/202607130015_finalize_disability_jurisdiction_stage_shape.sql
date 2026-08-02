begin;

-- The normalization trigger classifies unknown payloads as `other` during insert.
-- Reassert the explicit bounded-lane shape without touching payload/source fields,
-- so the trigger does not fire again.
update public.domain_deep_dive_v3_13_stage
set row_shape='state_directory_entry',
    updated_at=now()
where source_file='luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx'
  and row_shape='other';

commit;
