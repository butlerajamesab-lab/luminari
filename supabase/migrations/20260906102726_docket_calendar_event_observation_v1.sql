-- Docket Radar + Countdown Spec, Section 2.1
-- Append-only observation ledger for LegiScan calendar events extracted from
-- docket_bill_detail_cache payloads. Observations are never rewritten or deleted;
-- a vanished event gets retracted_at on a later observation cycle.

CREATE TABLE IF NOT EXISTS public.docket_calendar_event_observation (
  observation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id          integer NOT NULL,
  event_hash       text    NOT NULL,
  event_date       date    NOT NULL,
  event_time       time,
  event_type_raw   text    NOT NULL,
  event_type_id    integer NOT NULL,
  event_class      text    NOT NULL,
  location         text,
  description      text,
  source_detail_fetched_at timestamptz NOT NULL,
  observed_at      timestamptz NOT NULL DEFAULT now(),
  retracted_at     timestamptz,
  CONSTRAINT docket_calendar_event_observation_uq
    UNIQUE (bill_id, event_hash, source_detail_fetched_at),
  CONSTRAINT docket_calendar_event_class_chk
    CHECK (event_class IN ('hearing','executive_session','floor_reading','floor_action'))
);

CREATE INDEX IF NOT EXISTS idx_docket_cal_obs_bill
  ON public.docket_calendar_event_observation (bill_id);

CREATE INDEX IF NOT EXISTS idx_docket_cal_obs_future
  ON public.docket_calendar_event_observation (event_date)
  WHERE retracted_at IS NULL;

ALTER TABLE public.docket_calendar_event_observation ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.docket_calendar_event_observation IS
  'Append-only observation ledger of provider calendar events. Rows are observations, never the event itself; current schedule is a projection of latest non-retracted observations. Service-role writes; fail-closed to public clients.';
