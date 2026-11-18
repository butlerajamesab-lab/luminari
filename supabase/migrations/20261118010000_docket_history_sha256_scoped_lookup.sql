-- Forward-only, reviewed Docket -> Civic Genome history-read correction.
-- Release gate: source-bound registered bill identities are deterministic SHA256
-- under server/docket-canonical-bill-id.ts, never luminari_stable_uuid_v1 (MD5).
-- Does not change triggers, enqueueing, model semantics, or any record data.
-- This function retains the exact SECURITY DEFINER/search_path/return signature,
-- original cache join, safe source-id parsing, and history event/receipt logic.
-- The positive-ID branch is bound by the existing civic_genome_bill_bill_id_key.
-- p_source_bill_id IS NULL preserves the original unscoped observation.
-- Prior exact-head disposable full migration replay and generic function plan
-- passed; no worker activation occurs as part of this migration.
-- Deployed only after user-approved forward-only acceptance.
DO $gate$
DECLARE
  existing text;
  signature regprocedure;
BEGIN
  signature := to_regprocedure(
    'public.civic_genome_normalized_source_history_v3_unscoped(integer)'
  );
  IF signature IS NULL THEN
    RAISE EXCEPTION 'docket_history_source_function_missing';
  END IF;
  SELECT pg_get_functiondef(signature) INTO existing;
  IF existing IS NULL
    OR position('with source_rows as materialized (' in existing) = 0
    OR position('public.civic_genome_source_bill_in_sync_scope_v3(' in existing) = 0
    OR position('join public.docket_bill_detail_cache source_cache' in existing) = 0
    OR position('SECURITY DEFINER' in existing) = 0
    OR position('SET search_path TO' in existing) = 0
    OR position('where p_source_bill_id > 0' in existing) <> 0
  THEN
    RAISE EXCEPTION 'docket_history_source_function_drift_or_already_scoped';
  END IF;
END
$gate$;

CREATE OR REPLACE FUNCTION public.civic_genome_normalized_source_history_v3_unscoped(p_source_bill_id integer DEFAULT NULL::integer)
 RETURNS TABLE(genome_bill_id uuid, bill_id uuid, state_code text, source_bill_id integer, observed_at timestamp with time zone, source_sequence integer, source_duplicate_sequence integer, event_type text, valid_at timestamp with time zone, effective_at timestamp with time zone, state_position_after text, action_text text, chamber_code text, importance integer, source_event jsonb, source_event_key text, source_input_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
  with source_rows as materialized (
    -- Bound-scoped caller. A separate UNION ALL branch makes the exact UUID
    -- equality an index condition under PostgreSQL's generic function plan.
    select
      bill.genome_bill_id,
      bill.bill_id,
      bill.state_code,
      source_cache.bill_id as source_bill_id,
      source_cache.bill,
      source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id > 0
      and bill.bill_id = (
                  select (
                    substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'
                    ||substr('89ab',((strpos('0123456789abcdef',substr(h,17,1))-1)%4)+1,1)
                    ||substr(h,18,3)||'-'||substr(h,21,12)
                  )::uuid
                  from (
                    select encode(
                      extensions.digest(
                        convert_to(
                          'docket_room:legiscan:' || p_source_bill_id::text,
                          'UTF8'
                        ),
                        'sha256'
                      ),
                      'hex'
                    ) as h
                  ) as source_identity_hash
                )
      and public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
    union all
    -- Unscoped lifecycle readers retain the original full historical join.
    -- In an exact positive-ID invocation this branch has a one-time false gate.
    select
      bill.genome_bill_id,
      bill.bill_id,
      bill.state_code,
      source_cache.bill_id as source_bill_id,
      source_cache.bill,
      source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id is null
      and public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
    union all
    -- Compatibility for non-positive exact IDs (if historical records exist).
    -- Do not force them into the Docket SHA256 canonical-positive-ID family.
    select
      bill.genome_bill_id,
      bill.bill_id,
      bill.state_code,
      source_cache.bill_id as source_bill_id,
      source_cache.bill,
      source_cache.fetched_at as observed_at
    from public.civic_genome_bill bill
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = case
        when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
          then (bill.structural_dna_json->>'source_bill_id')::integer
        else null
      end
    where p_source_bill_id <= 0
      and public.civic_genome_source_bill_in_sync_scope_v3(
      source_cache.bill_id,
      p_source_bill_id
    )
  ), raw_history as materialized (
    select
      source.genome_bill_id,
      source.bill_id,
      source.state_code,
      source.source_bill_id,
      source.observed_at,
      history.ordinality::integer as source_sequence,
      history.value as source_event,
      case
        when coalesce(history.value->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         and history.value->>'date' <> '0000-00-00'
          then (history.value->>'date')::date
        else null
      end as valid_date,
      coalesce(history.value->>'action', '') as action_text,
      nullif(history.value->>'chamber', '') as chamber_code,
      case
        when coalesce(history.value->>'importance', '') ~ '^-?[0-9]+$'
          then (history.value->>'importance')::integer
        else null
      end as importance
    from source_rows source
    cross join lateral jsonb_array_elements(
      coalesce(source.bill->'history', '[]'::jsonb)
    ) with ordinality history(value, ordinality)
  ), numbered_history as materialized (
    select
      raw.*,
      row_number() over (
        partition by
          raw.source_bill_id,
          raw.valid_date,
          raw.action_text,
          raw.chamber_code
        order by raw.source_sequence
      )::integer as source_duplicate_sequence
    from raw_history raw
    where raw.valid_date is not null
      and raw.action_text <> ''
  ), classified_history as materialized (
    select
      history.*,
      case
        when lower(history.action_text) ~ '^effective date([[:space:]]|$)'
          then 'effective_date_set'
        when lower(history.action_text) ~ '(veto (was )?(override|overridden)|governor signed|signed by governor|approved by governor|chapter(ed)?[[:space:]]+[0-9]|became law|signed into law)'
          then 'enacted'
        when lower(history.action_text) ~ '(vetoed|governor veto)'
         and lower(history.action_text) !~ '(override|overridden)'
          then 'vetoed'
        when lower(history.action_text) ~ '(failed|withdrawn|dead|postponed indefinitely)'
          then 'failed'
        when lower(history.action_text) ~ 'prefiled'
          then 'prefiled'
        when lower(history.action_text) ~ '(first reading|introduced)'
          then 'introduced'
        when lower(history.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
          then 'passed_chamber'
        when lower(history.action_text) ~ '(amend|substitute|engrossed|revised)'
          then 'amended'
        when lower(history.action_text) ~ '(committee|referred|public hearing|executive action|do pass|without recommendation)'
          then 'committee_action'
        else 'legislative_action'
      end as event_type,
      case
        when lower(history.action_text) ~ '^effective date([[:space:]]|$)'
          then 'enacted'
        when lower(history.action_text) ~ '(veto (was )?(override|overridden)|governor signed|signed by governor|approved by governor|chapter(ed)?[[:space:]]+[0-9]|became law|signed into law)'
          then 'enacted'
        when lower(history.action_text) ~ '(vetoed|governor veto|failed|withdrawn|dead|postponed indefinitely)'
         and lower(history.action_text) !~ '(override|overridden)'
          then 'failed'
        when lower(history.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
          then case
            when (
              select count(distinct prior.chamber_code)
              from numbered_history prior
              where prior.genome_bill_id = history.genome_bill_id
                and prior.source_sequence <= history.source_sequence
                and prior.chamber_code is not null
                and lower(prior.action_text) ~ '(third reading,?[[:space:]]+passed|passed house|passed senate|passed both)'
            ) >= 2 then 'advanced_two_chambers'
            else 'advanced_one_chamber'
          end
        when lower(history.action_text) ~ '(committee|referred|public hearing|executive action|do pass|without recommendation)'
          then 'active_in_committee'
        when lower(history.action_text) ~ '(prefiled|first reading|introduced)'
          then 'introduced'
        else null
      end as state_position_after,
      case
        when lower(history.action_text) ~ '^effective date[[:space:]]+[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'
          then to_date(
            substring(
              lower(history.action_text)
              from '([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})'
            ),
            'MM/DD/YYYY'
          )::timestamp at time zone 'UTC'
        else null
      end as effective_at
    from numbered_history history
  ), hashed_history as materialized (
    select
      classified.*,
      encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'legiscan_bill_history_v2',
              classified.source_bill_id::text,
              classified.valid_date::text,
              coalesce(classified.chamber_code, ''),
              classified.action_text,
              classified.source_duplicate_sequence::text
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as base_source_event_key,
      encode(
        extensions.digest(
          convert_to(classified.source_event::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as source_input_hash
    from classified_history classified
  )
  select
    history.genome_bill_id,
    history.bill_id,
    history.state_code,
    history.source_bill_id,
    history.observed_at,
    history.source_sequence,
    history.source_duplicate_sequence,
    history.event_type,
    history.valid_date::timestamp at time zone 'UTC' as valid_at,
    history.effective_at,
    history.state_position_after,
    history.action_text,
    history.chamber_code,
    history.importance,
    history.source_event,
    case
      when existing.lifecycle_event_id is null
        or existing.source_input_hash = history.source_input_hash
        then history.base_source_event_key
      else encode(
        extensions.digest(
          convert_to(
            concat_ws(
              chr(31),
              'legiscan_bill_history_v3_correction',
              history.base_source_event_key,
              history.source_sequence::text,
              history.source_input_hash
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    end as source_event_key,
    history.source_input_hash
  from hashed_history history
  left join public.civic_genome_lifecycle_event_v2 existing
    on existing.genome_bill_id = history.genome_bill_id
   and existing.source_event_key = history.base_source_event_key;
$function$;
