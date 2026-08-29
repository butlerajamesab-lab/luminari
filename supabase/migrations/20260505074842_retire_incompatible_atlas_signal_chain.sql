-- The historical Atlas bridge was authored for a UUID Lighthouse chain that
-- does not match the canonical integer-ID cases/claims/findings schema.  The
-- function was never called by the application, but leaving its incompatible
-- DML installed made a service-role invocation fail unpredictably after it had
-- begun interpreting the payload.  Retain the signature for downstream ACL
-- migrations while making the retired boundary explicit and fail-closed.
CREATE OR REPLACE FUNCTION public.create_atlas_signal_chain(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '0A000',
    MESSAGE = 'create_atlas_signal_chain is retired',
    DETAIL = 'The installed Lighthouse case schema is incompatible with the abandoned UUID Atlas bridge; use the canonical Lighthouse intake boundary instead.';
END;
$$;

COMMENT ON FUNCTION public.create_atlas_signal_chain(jsonb)
IS 'Fail-closed compatibility stub for the retired UUID Atlas-to-Lighthouse chain. It performs no writes.';

REVOKE ALL ON FUNCTION public.create_atlas_signal_chain(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_atlas_signal_chain(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_atlas_signal_chain(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_atlas_signal_chain(jsonb) TO service_role;
