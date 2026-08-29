-- Keep the reviewed action substrate private to the service role while making
-- that intent explicit to the database linter. Add covering FK indexes for
-- source/run joins used by review receipts and activation checks.

do $block$
declare
  v_name text;
begin
  foreach v_name in array array[
    'luminari_reviewed_source_record_revision_v1',
    'luminari_situation_action_revision_v1',
    'luminari_situation_action_current_v1',
    'luminari_situation_action_binding_revision_v1',
    'luminari_situation_action_binding_current_v1',
    'luminari_reviewed_context_revision_v1',
    'luminari_reviewed_context_current_v1'
  ] loop
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      v_name || '_service_role_all',
      v_name
    );
  end loop;
end;
$block$;

create index if not exists luminari_situation_action_current_run_idx
  on public.luminari_situation_action_current_v1 (active_run_id);

create index if not exists luminari_situation_action_binding_revision_source_idx
  on public.luminari_situation_action_binding_revision_v1
  (source_record_revision_id);

create index if not exists luminari_situation_action_binding_current_run_idx
  on public.luminari_situation_action_binding_current_v1 (active_run_id);

create index if not exists luminari_situation_action_binding_current_source_idx
  on public.luminari_situation_action_binding_current_v1
  (source_record_revision_id);

create index if not exists luminari_reviewed_context_current_run_idx
  on public.luminari_reviewed_context_current_v1 (active_run_id);

create index if not exists luminari_reviewed_context_current_revision_idx
  on public.luminari_reviewed_context_current_v1 (context_revision_id);
