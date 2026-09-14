CREATE TABLE IF NOT EXISTS public.docket_state_projection_retry (
  state text PRIMARY KEY CHECK (state ~ '^[A-Z]{2}$'),
  failure_count integer NOT NULL DEFAULT 1 CHECK (failure_count > 0),
  retry_after timestamptz NOT NULL,
  last_error_code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS docket_state_projection_retry_due_idx
  ON public.docket_state_projection_retry (retry_after, state);

ALTER TABLE public.docket_state_projection_retry ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.docket_state_projection_retry IS
  'Durable retry queue for provider-cache refreshes whose Civic Genome projection did not complete.';
