drop view if exists compat.legislator_contacts;

alter table public.legislator_contacts
alter column chamber type text
using chamber::text;

create view compat.legislator_contacts as
select
  id,
  full_name,
  title,
  jurisdiction,
  chamber,
  party,
  district,
  state,
  contact_email,
  contact_phone,
  office_address,
  website,
  committees,
  domains,
  term_start,
  term_end,
  notes,
  added_by,
  created_at,
  updated_at
from public.legislator_contacts;