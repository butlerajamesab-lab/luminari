-- Atlas stream registry recovery.
-- Lighthouse mirrors deterministic Atlas signal_events. It does not fetch or
-- reinterpret the upstream agency feeds represented by these rows.

create unique index if not exists streams_pkey
  on public.streams (stream_id);

create unique index if not exists signal_events_pkey
  on public.signal_events (stream_id, "offset");

create unique index if not exists cursors_stream_id_name_key
  on public.cursors (stream_id, name);

do $atlas_identity_contract$
declare
  streams_identity_columns text[];
  signal_events_identity_columns text[];
  cursors_identity_columns text[];
begin
  select array_agg(attribute.attname order by key_column.ordinality)
    into streams_identity_columns
    from pg_index index_record
    join pg_class index_relation on index_relation.oid = index_record.indexrelid
    join pg_class table_relation on table_relation.oid = index_record.indrelid
    join pg_namespace namespace on namespace.oid = table_relation.relnamespace
    cross join lateral unnest(index_record.indkey::smallint[])
      with ordinality as key_column(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = table_relation.oid
     and attribute.attnum = key_column.attnum
   where namespace.nspname = 'public'
     and table_relation.relname = 'streams'
     and index_relation.relname = 'streams_pkey'
     and index_record.indisunique
     and index_record.indisvalid
     and index_record.indisready
     and index_record.indpred is null
     and index_record.indexprs is null
     and index_record.indnatts = index_record.indnkeyatts
   group by index_record.indexrelid;

  if streams_identity_columns is distinct from array['stream_id']::text[] then
    raise exception
      'Atlas identity mismatch for public.streams: expected unique (stream_id), observed %',
      streams_identity_columns;
  end if;

  select array_agg(attribute.attname order by key_column.ordinality)
    into signal_events_identity_columns
    from pg_index index_record
    join pg_class index_relation on index_relation.oid = index_record.indexrelid
    join pg_class table_relation on table_relation.oid = index_record.indrelid
    join pg_namespace namespace on namespace.oid = table_relation.relnamespace
    cross join lateral unnest(index_record.indkey::smallint[])
      with ordinality as key_column(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = table_relation.oid
     and attribute.attnum = key_column.attnum
   where namespace.nspname = 'public'
     and table_relation.relname = 'signal_events'
     and index_relation.relname = 'signal_events_pkey'
     and index_record.indisunique
     and index_record.indisvalid
     and index_record.indisready
     and index_record.indpred is null
     and index_record.indexprs is null
     and index_record.indnatts = index_record.indnkeyatts
   group by index_record.indexrelid;

  if signal_events_identity_columns is distinct from array['stream_id', 'offset']::text[] then
    raise exception
      'Atlas identity mismatch for public.signal_events: expected unique (stream_id, offset), observed %',
      signal_events_identity_columns;
  end if;

  select array_agg(attribute.attname order by key_column.ordinality)
    into cursors_identity_columns
    from pg_index index_record
    join pg_class index_relation on index_relation.oid = index_record.indexrelid
    join pg_class table_relation on table_relation.oid = index_record.indrelid
    join pg_namespace namespace on namespace.oid = table_relation.relnamespace
    cross join lateral unnest(index_record.indkey::smallint[])
      with ordinality as key_column(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = table_relation.oid
     and attribute.attnum = key_column.attnum
   where namespace.nspname = 'public'
     and table_relation.relname = 'cursors'
     and index_relation.relname = 'cursors_stream_id_name_key'
     and index_record.indisunique
     and index_record.indisvalid
     and index_record.indisready
     and index_record.indpred is null
     and index_record.indexprs is null
     and index_record.indnatts = index_record.indnkeyatts
   group by index_record.indexrelid;

  if cursors_identity_columns is distinct from array['stream_id', 'name']::text[] then
    raise exception
      'Atlas identity mismatch for public.cursors: expected unique (stream_id, name), observed %',
      cursors_identity_columns;
  end if;
end
$atlas_identity_contract$;

with atlas_runtime_rows as (
  select id,
         stream_id_dsr,
         source_dsr
    from public.data_stream_registry
   where parser_mode_dsr = 'atlas_signal_events'
     and post_processing_engine_name_dsr = 'atlas_bridge_runtime'
     and api_url_dsr like '/v1/streams/%/events'
     and coalesce(source_dsr, '') <> 'atlas_stream'
)
update public.data_stream_registry registry
   set description_dsr = concat_ws(
         E'\n',
         nullif(btrim(registry.description_dsr), ''),
         'Atlas upstream source: ' || runtime.source_dsr
       ),
       source_dsr = 'atlas_stream',
       enabled_dsr = true,
       auto_disabled_dsr = false,
       consecutive_failures_dsr = 0,
       retry_after_at_dsr = null,
       disabled_reason_dsr = null,
       last_error_type_dsr = null,
       last_error_message_dsr = null,
       last_http_status_dsr = null,
       last_run_status_dsr = 'atlas_bridge_pending',
       parser_mode_dsr = 'atlas_signal_events',
       post_processing_engine_name_dsr = 'atlas_bridge_runtime',
       updated_at_dsr = (extract(epoch from clock_timestamp()) * 1000)::bigint
  from atlas_runtime_rows runtime
 where registry.id = runtime.id;

update public.data_stream_registry
   set enabled_dsr = true,
       auto_disabled_dsr = false,
       consecutive_failures_dsr = 0,
       retry_after_at_dsr = null,
       disabled_reason_dsr = null,
       last_error_type_dsr = null,
       last_error_message_dsr = null,
       last_http_status_dsr = null,
       last_run_status_dsr = case
         when last_run_status_dsr = 'completed' then last_run_status_dsr
         else 'atlas_bridge_pending'
       end,
       updated_at_dsr = (extract(epoch from clock_timestamp()) * 1000)::bigint
 where parser_mode_dsr = 'atlas_signal_events'
   and post_processing_engine_name_dsr = 'atlas_bridge_runtime'
   and api_url_dsr like '/v1/streams/%/events'
   and source_dsr = 'atlas_stream';

update public.data_stream_registry
   set enabled_dsr = false,
       auto_disabled_dsr = false,
       consecutive_failures_dsr = 0,
       retry_after_at_dsr = null,
       last_run_status_dsr = 'retired_superseded_by_atlas',
       disabled_reason_dsr = 'retired_crossed_wire_or_obsolete_direct_source_20260729',
       last_error_type_dsr = null,
       last_error_message_dsr = null,
       last_http_status_dsr = null,
       updated_at_dsr = (extract(epoch from clock_timestamp()) * 1000)::bigint
 where stream_id_dsr in (
   'ds_courtlistener',
   'ds_dol_wage_hour',
   'ds_eeoc_charges',
   'ds_hud_fheo',
   'ds_nlrb_cases',
   'ds_ssa_disability',
   'seattle_fire_911'
 );
