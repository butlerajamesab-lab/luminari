-- Runtime convergence: scrolling hydration + enforcement tallies

create or replace view public.v_enforcement_record_tallies as
select
  jurisdiction,
  count(*) as total_records,
  count(distinct statutory_authority) as authority_count,
  max(created_at) as latest_record
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
  row_number() over (order by created_at desc nulls last) as runtime_index,
  *
from public.detected_signals;

-- UI contract:
-- All major renderer surfaces should consume *_scroll_runtime
-- views with infinite scroll / pagination instead of static 20-row slices.
