\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_before_cases bigint;
  v_before_claims bigint;
  v_before_findings bigint;
  v_after_cases bigint;
  v_after_claims bigint;
  v_after_findings bigint;
  v_rejected boolean := false;
  v_message text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_atlas_signal_chain'
      AND p.oid::regprocedure::text = 'create_atlas_signal_chain(jsonb)'
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public']::text[]
  ) THEN
    RAISE EXCEPTION 'retired Atlas signal-chain function is missing its SECURITY DEFINER/search_path boundary';
  END IF;

  IF has_function_privilege('anon', 'public.create_atlas_signal_chain(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_atlas_signal_chain(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_atlas_signal_chain(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'retired Atlas signal-chain function ACL is not service-role-only';
  END IF;

  SELECT count(*) INTO v_before_cases FROM public.cases;
  SELECT count(*) INTO v_before_claims FROM public.claims;
  SELECT count(*) INTO v_before_findings FROM public.findings;

  BEGIN
    PERFORM public.create_atlas_signal_chain(jsonb_build_object('queue_id', -1));
  EXCEPTION
    WHEN SQLSTATE '0A000' THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      v_rejected := v_message = 'create_atlas_signal_chain is retired';
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'retired Atlas signal-chain function did not fail closed with the canonical receipt';
  END IF;

  SELECT count(*) INTO v_after_cases FROM public.cases;
  SELECT count(*) INTO v_after_claims FROM public.claims;
  SELECT count(*) INTO v_after_findings FROM public.findings;

  IF (v_before_cases, v_before_claims, v_before_findings)
     IS DISTINCT FROM
     (v_after_cases, v_after_claims, v_after_findings) THEN
    RAISE EXCEPTION 'retired Atlas signal-chain function changed Lighthouse rows';
  END IF;
END
$verify$;
