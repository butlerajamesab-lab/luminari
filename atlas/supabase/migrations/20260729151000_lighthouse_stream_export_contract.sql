-- Atlas read-only export contract for the Lighthouse signal-event bridge.
-- Apply to Atlas project bjdjjgnkhxblnpdrjqtw, not Lighthouse.
--
-- Direct anonymous table access remains closed. Only explicitly allowlisted
-- stream definitions and bounded event pages are exposed through the two
-- security-definer RPCs below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.lighthouse_stream_export_allowlist (
  stream_id text primary key,
  export_enabled boolean not null default true,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.lighthouse_stream_export_allowlist
  from public, anon, authenticated;

insert into private.lighthouse_stream_export_allowlist (stream_id, export_enabled)
values
  ('bls_employment', true),
  ('census_acs', true),
  ('cfpb_complaints', true),
  ('chicago_311_service_requests', true),
  ('court_listener', true),
  ('dol_whd_violations', true),
  ('eeoc_filings', true),
  ('epa_echo', true),
  ('fara_foreign_agents', true),
  ('fec_campaign_finance', true),
  ('grants_gov', true),
  ('grants_gov_live', true),
  ('hud_housing', true),
  ('irs_exempt_orgs', true),
  ('nyc_311_service_requests', true),
  ('open_secrets', true),
  ('open_states', true),
  ('open_states_live', true),
  ('osha_incidents', true),
  ('osha_inspections', true),
  ('pro_publica', true),
  ('regulations_gov', true),
  ('sec_edgar', true),
  ('usa_spending', true),
  ('usda_snap', true),
  ('wa_ag_consumer_complaints', true),
  ('wa_pdc_documents', true)
on conflict (stream_id) do update
  set export_enabled = excluded.export_enabled,
      updated_at = now();

create or replace function public.get_lighthouse_stream_definition(
  p_stream_id text
)
returns table (
  stream_id text,
  source_id text,
  jurisdiction_id text,
  module_hint text,
  throughput_profile text,
  safety_profile text,
  governance_contract_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select
    stream.stream_id,
    stream.source_id,
    stream.jurisdiction_id,
    stream.module_hint,
    stream.throughput_profile,
    stream.safety_profile,
    stream.governance_contract_id,
    stream.status,
    stream.created_at,
    stream.updated_at
  from public.streams stream
  join private.lighthouse_stream_export_allowlist allowlist
    on allowlist.stream_id = stream.stream_id
   and allowlist.export_enabled
  where stream.stream_id = p_stream_id
  limit 1
$function$;

create or replace function public.get_lighthouse_signal_events(
  p_stream_id text,
  p_offset bigint default 0,
  p_limit integer default 1000
)
returns table (
  stream_id text,
  "offset" bigint,
  "timestamp" timestamptz,
  signal_type text,
  spacetime jsonb,
  provenance jsonb,
  payload jsonb,
  source_id text,
  jurisdiction_id text,
  module_hint text,
  ingested_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select
    event.stream_id,
    event."offset",
    event."timestamp",
    event.signal_type,
    event.spacetime,
    event.provenance,
    event.payload,
    event.source_id,
    event.jurisdiction_id,
    event.module_hint,
    event.ingested_at
  from public.signal_events event
  join private.lighthouse_stream_export_allowlist allowlist
    on allowlist.stream_id = event.stream_id
   and allowlist.export_enabled
  where event.stream_id = p_stream_id
    and event."offset" >= greatest(coalesce(p_offset, 0), 0)
  order by event."offset" asc
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$function$;

revoke all on function public.get_lighthouse_stream_definition(text)
  from public;
revoke all on function public.get_lighthouse_signal_events(text, bigint, integer)
  from public;

grant execute on function public.get_lighthouse_stream_definition(text)
  to anon, authenticated, service_role;
grant execute on function public.get_lighthouse_signal_events(text, bigint, integer)
  to anon, authenticated, service_role;

comment on table private.lighthouse_stream_export_allowlist is
  'Explicit Atlas stream allowlist for the read-only Lighthouse event bridge.';
comment on function public.get_lighthouse_stream_definition(text) is
  'Returns one explicitly allowlisted Atlas stream definition to Lighthouse.';
comment on function public.get_lighthouse_signal_events(text, bigint, integer) is
  'Returns a bounded ordered page of explicitly allowlisted Atlas signal events to Lighthouse.';
