create or replace view public.v_lighthouse_case_surface_status_v1 as
select
  c.id as case_id,
  c.name as case_name,
  c.status as case_status,
  (select count(*) from public.documents d where d.case_id=c.id) as documents,
  (select count(*) from public.entities e where e.case_id=c.id) as entities,
  (select count(*) from public.claims cl where cl.case_id=c.id) as claims,
  (select count(*) from public.findings f where f.case_id=c.id) as findings,
  (select count(*) from public.relationships r where r.case_id=c.id) as relationships,
  (select count(*) from public.signals s where s.case_id=c.id) as structural_signals,
  (select count(*) from public.evidence ev where ev.case_id=c.id) as evidence,
  (select count(*) from public.engine_runs er where er.case_id=c.id) as engine_runs,
  (select max(er.id) from public.engine_runs er where er.case_id=c.id) as latest_engine_run_id,
  case
    when (select count(*) from public.documents d where d.case_id=c.id)>0
      and (select count(*) from public.engine_runs er where er.case_id=c.id)=0
      then 'awaiting_analysis_run'
    when (select count(*) from public.engine_runs er where er.case_id=c.id)>0
      and (select count(*) from public.findings f where f.case_id=c.id)=0
      then 'analyzed_no_findings'
    when (select count(*) from public.findings f where f.case_id=c.id)>0
      then 'findings_present'
    else 'empty'
  end as analysis_state
from public.cases c;
