-- Explicit empty-state replay variant for production receipt 20261017021051.
-- Executed production SQL is preserved verbatim under supabase/verification/applied/.
-- This file never performs the historical DELETE. Nonempty targets fail closed;
-- use the separately reviewed manifest-pinned production action for legacy data.
DO $empty_trait_replay$
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 LOCK TABLE public.civic_genome_trait,public.civic_genome_prism_verification_binding IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.civic_genome_trait)
 OR EXISTS(SELECT 1 FROM public.civic_genome_prism_verification_binding)
 THEN RAISE EXCEPTION 'trait_purge_replay_refuses_nonempty_target'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_trigger t
  WHERE t.tgrelid='public.civic_genome_trait'::regclass
   AND t.tgname='zz_civic_genome_block_rosetta_trait_write_v1'
   AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23
   AND md5(pg_get_functiondef(t.tgfoid))='87ffdb41a744456fb3863f2a0574b30c'
 ) THEN RAISE EXCEPTION 'trait_purge_replay_write_fence_changed'; END IF;
 REVOKE SELECT ON TABLE public.civic_genome_trait FROM PUBLIC,anon,authenticated,service_role;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))r(name)
  WHERE has_table_privilege(r.name,'public.civic_genome_trait','SELECT'))
 THEN RAISE EXCEPTION 'trait_purge_replay_application_read_remains'; END IF;
END $empty_trait_replay$;
