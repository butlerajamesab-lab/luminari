create or replace view public.v_grounded_statutes as
select
  s.id,
  s.citation,
  s.short_title as title,
  s.jurisdiction,
  s.domains as domain,
  s.summary,
  s.verbatim_key_text as full_text,
  s.source_url,
  s.effective_date,
  s.verification_status,
  s.created_at
from public.legal_statutes s;

create or replace view public.v_legal_library_expanded as
select
  'statute' as entry_type,
  citation as primary_reference,
  title as entry_title,
  jurisdiction,
  domain,
  summary,
  full_text,
  source_url,
  verification_status as verification_state,
  created_at
from public.v_grounded_statutes;
