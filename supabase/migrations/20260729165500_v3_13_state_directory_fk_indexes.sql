begin;

create index if not exists idx_state_directory_row_classification_run_id
  on public.state_directory_row_classification(run_id);

create index if not exists idx_state_directory_logical_record_run_id
  on public.state_directory_logical_record(run_id);

create index if not exists idx_state_directory_resource_promotion_preferred_record
  on public.state_directory_resource_promotion(preferred_logical_record_id);

commit;
