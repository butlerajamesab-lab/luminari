-- civic_genome_normalized_source_history_v3_unscoped ends with a LEFT JOIN from
-- its materialized history CTE to civic_genome_lifecycle_event_v2 (725k rows).
-- The planner cannot see the CTE's real size, so it hash-joins the whole event
-- table and spills to temp: measured 2026-11-25 for one bill, 807 ms,
-- 81,805 buffers read, 15,139 temp blocks written. The function runs twice per
-- derived-work bill, which made each bill cost ~870 MB of reads.
--
-- Same rows, looked up per history row through the unique source_event_key
-- index instead (source_event_key is unique, so LIMIT 1 changes nothing).
-- Verified before change: 47 ms, 68 buffers read; identical output for 40
-- completed bills (400 events, md5 equal). Only this join is rewritten; the
-- rest of the function is taken from the live definition unchanged.
do $migration$
declare
  v_def text;
  v_old text := E'  left join public.civic_genome_lifecycle_event_v2 existing\n    on existing.genome_bill_id = history.genome_bill_id\n   and existing.source_event_key = history.base_source_event_key;';
  v_new text := E'  left join lateral (\n    select existing.lifecycle_event_id, existing.source_input_hash\n    from public.civic_genome_lifecycle_event_v2 existing\n    where existing.source_event_key = history.base_source_event_key\n      and existing.genome_bill_id = history.genome_bill_id\n    limit 1\n  ) existing on true;';
begin
  v_def := pg_get_functiondef('public.civic_genome_normalized_source_history_v3_unscoped'::regproc);
  if position(v_new in v_def) > 0 then
    return; -- already applied
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'genome_history_existing_lookup_pattern_not_found';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
