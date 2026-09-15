begin;

-- The prefix classifier was installed after the earlier v3 lifecycle
-- reconciliation passes. Re-run only histories containing the newly scoped
-- subsidiary-failure form so the append-only current projection supersedes
-- any false whole-measure terminal event.
do $reconcile$
declare
  affected record;
begin
  for affected in
    select distinct event.source_bill_id
    from public.civic_genome_normalized_source_history_v3_scope_v1(null) event
    where event.source_bill_id is not null
      and lower(event.action_text)
        ~ '^[[:space:]]*failed\\y.{0,80}\\y(amendments?|motions?)\\y'
      and lower(event.action_text) !~
        '\\y(bill|measure|resolution)\\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died|((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\\y'
      and (
        event.event_type in ('failed', 'vetoed')
        or event.state_position_after = 'failed'
      )
  loop
    perform public.sync_civic_genome_lifecycle_history_v3(affected.source_bill_id);
  end loop;
end;
$reconcile$;

commit;
