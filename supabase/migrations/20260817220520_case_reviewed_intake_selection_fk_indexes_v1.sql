-- Cover the two immutable provenance foreign keys used by the append-only
-- reviewed-intake selection ledger.  These indexes do not change visibility,
-- mutation privileges, current-state semantics, or user choice behavior.

create index if not exists luminari_case_reviewed_intake_source_revision_idx
  on public.luminari_case_reviewed_intake_selection_event_v1
  (source_item_revision_id);

create index if not exists luminari_case_reviewed_intake_source_package_idx
  on public.luminari_case_reviewed_intake_selection_event_v1
  (source_package_id);
