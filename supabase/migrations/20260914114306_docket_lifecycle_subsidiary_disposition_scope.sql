begin;

-- Keep the original normalizer as the prior contract and place a scoped
-- adapter at the stable name consumed by the v3 synchronizer.
alter function public.civic_genome_normalized_source_history_v3(integer)
  rename to civic_genome_normalized_source_history_v3_unscoped;

create function public.civic_genome_normalized_source_history_v3(
  p_source_bill_id integer default null
)
returns table (
  genome_bill_id uuid, bill_id uuid, state_code text, source_bill_id integer,
  observed_at timestamptz, source_sequence integer,
  source_duplicate_sequence integer, event_type text, valid_at timestamptz,
  effective_at timestamptz, state_position_after text, action_text text,
  chamber_code text, importance integer, source_event jsonb,
  source_event_key text, source_input_hash text
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
  with original as materialized (
    select *
    from public.civic_genome_normalized_source_history_v3_unscoped(p_source_bill_id)
  ), scoped as materialized (
    select
      original.*,
      lower(original.action_text) ~ '^[[:space:]]*(amendment|motion)\y'
        and lower(original.action_text) !~
          '\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died|((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\y'
        and (
          original.event_type in ('failed', 'vetoed')
          or original.state_position_after = 'failed'
        ) as is_subsidiary_disposition
    from original
  )
  select
    scoped.genome_bill_id, scoped.bill_id, scoped.state_code,
    scoped.source_bill_id, scoped.observed_at, scoped.source_sequence,
    scoped.source_duplicate_sequence,
    case
      when scoped.is_subsidiary_disposition
        and lower(scoped.action_text) ~ '(amend|substitute|engrossed|revised)'
        then 'amended'
      when scoped.is_subsidiary_disposition then 'legislative_action'
      else scoped.event_type
    end,
    scoped.valid_at, scoped.effective_at,
    case when scoped.is_subsidiary_disposition then null
         else scoped.state_position_after end,
    scoped.action_text, scoped.chamber_code, scoped.importance,
    scoped.source_event,
    case
      when scoped.is_subsidiary_disposition then encode(
        extensions.digest(
          convert_to(
            concat_ws(chr(31), 'docket_subsidiary_disposition_scope_v1', scoped.source_event_key),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
      else scoped.source_event_key
    end,
    scoped.source_input_hash
  from scoped;
$$;

revoke all on function public.civic_genome_normalized_source_history_v3(integer)
  from public, anon, authenticated;
grant execute on function public.civic_genome_normalized_source_history_v3(integer)
  to service_role;

comment on function public.civic_genome_normalized_source_history_v3(integer) is
  'Normalizes provider history with whole-measure terminal evidence scoped away from subsidiary amendment and motion dispositions.';

commit;
