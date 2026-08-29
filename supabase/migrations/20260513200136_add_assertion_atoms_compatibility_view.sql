-- This compatibility overlay was authored against a pre-ledger claims shape.
-- A fresh replay can legitimately contain the older claims relation without
-- the snapshot and pipeline columns. Only publish the view when its complete
-- source contract exists; never manufacture lineage columns or replace a
-- non-view relation with the compatibility name.
do $compatibility$
declare
  prerequisite_count integer;
  existing_kind "char";
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'claims'
    and column_name = any(array[
      'id',
      'case_id',
      'snapshot_id',
      'pipeline_run_id',
      'claim_text',
      'claim_type',
      'created_at'
    ]);

  select c.relkind
    into existing_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'assertion_atoms';

  if prerequisite_count = 7
     and (existing_kind is null or existing_kind = 'v') then
    execute $view$
      create or replace view public.assertion_atoms as
      select
        id,
        case_id,
        snapshot_id,
        pipeline_run_id,
        claim_text as assertion_text,
        claim_type as assertion_type,
        created_at
      from public.claims
    $view$;

    comment on view public.assertion_atoms is
      'Compatibility semantic overlay view. Non-destructive alias over claims table for gradual CDA domain-agnostic convergence.';
  end if;
end
$compatibility$;
