-- Atlas stream registry recovery.
--
-- Lighthouse mirrors deterministic Atlas signal_events. It does not fetch or
-- reinterpret the upstream agency feeds represented by these rows. Preserve
-- the original upstream source in the human-readable description, then switch
-- source_dsr to the runtime adapter family consumed by the Lighthouse
-- scheduler.
--
-- This migration is replay-safe and non-destructive.

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

-- Rows may already have source_dsr='atlas_stream' if this migration is replayed
-- or a prior recovery pass updated them. Reset only bridge operational state.
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

-- Retain crossed-wire and obsolete direct-source rows for audit, but remove
-- them from scheduling and health calculations. Their canonical replacements
-- are the Atlas stream-registry rows above.
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
