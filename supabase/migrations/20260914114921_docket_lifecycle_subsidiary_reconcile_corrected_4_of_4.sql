begin;

-- Correct the escaped word-boundary matcher in the preceding bounded repair.
-- Reconciliation remains append-only through the v3 synchronizer.
do $reconcile$
declare affected record;
begin
  for affected in
    select distinct event.source_bill_id
    from public.v_civic_genome_lifecycle_event_current_v3 event
    where mod(abs(hashtext(event.source_bill_id::text)), 4) = 3
      and lower(event.action_text) ~ '^[[:space:]]*(amendment|motion)\y'
      and lower(event.action_text) !~ '\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died|((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\y'
      and (event.event_type in ('failed', 'vetoed') or event.state_position_after = 'failed')
  loop
    perform public.sync_civic_genome_lifecycle_history_v3(affected.source_bill_id);
  end loop;
end;
$reconcile$;

commit;
