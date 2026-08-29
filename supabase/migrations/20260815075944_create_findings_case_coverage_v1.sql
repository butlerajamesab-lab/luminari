create or replace view public.v_lighthouse_findings_case_coverage_v1 as
with case_ids as (
  select id as case_id,name as case_name,status from public.cases
), f as (
  select case_id,count(*)::bigint as finding_count,
         count(*) filter (where provenance_status ilike '%verified%' or provenance_status ilike '%bound%')::bigint as provenance_bound_count,
         max(created_at) as latest_finding_at
  from public.findings group by case_id
), d as (
  select case_id,count(*)::bigint as document_count from public.documents group by case_id
), e as (
  select case_id,count(*)::bigint as engine_run_count,max(id) as latest_engine_run_id from public.engine_runs group by case_id
), all_ids as (
  select case_id from case_ids union select case_id from f union select case_id from d union select case_id from e
)
select a.case_id,c.case_name,c.status,
       coalesce(d.document_count,0) as document_count,
       coalesce(e.engine_run_count,0) as engine_run_count,
       e.latest_engine_run_id,
       coalesce(f.finding_count,0) as finding_count,
       coalesce(f.provenance_bound_count,0) as provenance_bound_count,
       f.latest_finding_at,
       case
         when c.case_id is null and coalesce(f.finding_count,0)>0 then 'orphan_findings'
         when c.case_id is null then 'orphan_case_reference'
         when coalesce(d.document_count,0)>0 and coalesce(e.engine_run_count,0)=0 and coalesce(f.finding_count,0)=0 then 'awaiting_analysis_run'
         when coalesce(e.engine_run_count,0)>0 and coalesce(f.finding_count,0)=0 then 'analyzed_no_findings'
         when coalesce(f.finding_count,0)>0 then 'findings_present'
         else 'empty'
       end as coverage_state
from all_ids a
left join case_ids c using(case_id)
left join f using(case_id)
left join d using(case_id)
left join e using(case_id);
