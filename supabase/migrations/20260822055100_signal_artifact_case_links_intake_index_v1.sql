begin;

create index if not exists idx_signal_artifact_case_links_intake_signal
  on public.signal_artifact_case_links_v1(intake_signal_id)
  where intake_signal_id is not null;

comment on index public.idx_signal_artifact_case_links_intake_signal is
  'Covers the optional intake-signal foreign key used by governed case-link artifact lookups.';

commit;
