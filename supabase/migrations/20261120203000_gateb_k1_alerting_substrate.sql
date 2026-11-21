-- Gate B Kernel 1 — Alerting substrate (2026-11-20).
--
-- drizzle/schema.ts has declared alert_subscriptions, alert_events, and
-- alert_delivery_log since the L10 generation, and migration 032
-- registered them in the schema registry — but no migration ever created
-- the tables, so every reader of the substrate (enginesV4.alertingStats
-- via server/engines/public-alerting.ts) has been querying tables that do
-- not exist. This migration creates them exactly as the drizzle schema
-- declares them (same table names, same suffixed column names, same
-- types and defaults), nothing renamed and nothing added beyond indexes.
--
-- On top of the schema's own indexes, one partial unique index gives the
-- governed-candidate alerting kernel (server/alerting/) a durable
-- no-duplicate guarantee: at most one alert event per subscription per
-- governed candidate signal, keyed by the candidate's UUID carried in
-- metadata_ae->>'signalId' (alert_events.trigger_id_ae is an integer and
-- cannot hold a live_data_signals UUID).

create table if not exists public.alert_subscriptions (
  id serial primary key,
  user_id_as varchar(128) not null,
  subscription_type_as varchar(64) not null,
  target_scope_as varchar(128),
  target_id_as integer,
  jurisdiction_as varchar(256),
  industry_as varchar(256),
  claim_type_as varchar(256),
  risk_threshold_as varchar(64) default 'high',
  alert_frequency_as varchar(64) default 'immediate',
  is_paused_as smallint default 0,
  notification_channels_as jsonb,
  created_at_as bigint not null,
  updated_at_as bigint not null
);

create index if not exists idx_as_user on public.alert_subscriptions (user_id_as);
create index if not exists idx_as_type on public.alert_subscriptions (subscription_type_as);

create table if not exists public.alert_events (
  id serial primary key,
  subscription_id_ae integer,
  alert_type_ae varchar(128) not null,
  trigger_source_ae varchar(128),
  trigger_id_ae integer,
  risk_score_ae integer,
  risk_level_ae varchar(64),
  severity_ae varchar(64) default 'info',
  message_ae text,
  metadata_ae jsonb,
  created_at_ae bigint not null,
  sent_at_ae bigint
);

create index if not exists idx_ae_sub on public.alert_events (subscription_id_ae);
create index if not exists idx_ae_type on public.alert_events (alert_type_ae);
create index if not exists idx_ae_severity on public.alert_events (severity_ae);

create table if not exists public.alert_delivery_log (
  id serial primary key,
  alert_id_adl integer not null,
  channel_adl varchar(64) not null,
  recipient_adl varchar(256),
  status_adl varchar(64) default 'pending',
  error_message_adl text,
  sent_at_adl bigint
);

create index if not exists idx_adl_alert on public.alert_delivery_log (alert_id_adl);

-- Kernel dedupe: one governed-candidate alert per (subscription, signal).
create unique index if not exists idx_ae_governed_candidate_unique
  on public.alert_events (subscription_id_ae, (metadata_ae ->> 'signalId'))
  where alert_type_ae = 'governed_candidate';
