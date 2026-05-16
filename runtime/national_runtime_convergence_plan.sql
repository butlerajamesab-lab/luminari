-- National Runtime Convergence Plan
-- Scroll hydration + nationwide CivicMap runtime circulation

create or replace view public.v_enforcement_record_tallies as
select
  jurisdiction,
  count(*) as total_records,
  count(distinct statutory_authority) as authority_count,
  max("createdAt") as latest_record
from public.legal_enforcement_records
group by jurisdiction;

create or replace view public.v_legal_library_scroll_runtime as
select
  row_number() over (order by created_at desc nulls last) as runtime_index,
  *
from public.v_runtime_legal_library;

create or replace view public.v_civic_map_scroll_runtime as
select
  row_number() over (order by created_at desc nulls last) as runtime_index,
  *
from public.v_civic_map_runtime;

create or replace view public.v_runtime_signal_scroll as
select
  row_number() over (order by coalesce("createdAt", now()) desc nulls last) as runtime_index,
  *
from public.detected_signals;

create or replace view public.v_case_law_display_runtime as
select
  id,
  coalesce(case_name, citation) as display_title,
  citation,
  court,
  summary,
  source_url,
  created_at
from public.v_runtime_case_law;

-- Renderer convergence standard:
-- All major runtime surfaces should consume *_scroll_runtime
-- views using pagination, virtualization, and lazy hydration
-- instead of fixed 20-row renderer slices.
