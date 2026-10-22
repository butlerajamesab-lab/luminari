-- PREPARED ONLY: four-view application-access retirement. No data or view-body changes.
DO $view_cut$
DECLARE matched integer; before_rows jsonb; after_rows jsonb;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.civic_genome_trait,public.civic_genome_bill,public.civic_genome_bill_version,public.civic_genome_projection_entity_version IN SHARE MODE;
 WITH expected(name,definition_md5) AS(VALUES ('public.docket_bill_drift_delta','5cd3a477021b9794d0eaa46f7bc4b0e4'),('public.docket_bill_impact_callouts','e2b811f7140ee5f08fe20b517a14e334'),('public.docket_bill_obligation_checklist','2bd5ce9396cb757ccf8072377c73eb67'),('public.v_civic_genome_prism_verification_status','c0707929b3015ddcf537498ef01f01cb'))
 SELECT count(*) INTO matched FROM expected e JOIN pg_class c ON c.oid=to_regclass(e.name)
 WHERE c.relkind='v' AND pg_get_userbyid(c.relowner)='postgres' AND md5(pg_get_viewdef(c.oid,true))=e.definition_md5;
 IF matched<>4 THEN RAISE EXCEPTION 'structural view definition or ownership changed'; END IF;

 -- Production's original four-view cutoff began from service_role SELECT.
 -- Fresh replay may reach the same cut after the earlier source-only fence
 -- already removed SELECT on the three Docket structural views. Accept only
 -- those two exact ACL fingerprints; never accept anon/authenticated access,
 -- unknown privileges, view-body drift or a missing trigger.
 WITH approved_prior(name,acl) AS(VALUES
 ('public.docket_bill_drift_delta','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
 ('public.docket_bill_drift_delta','{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}'),
 ('public.docket_bill_impact_callouts','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
 ('public.docket_bill_impact_callouts','{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}'),
 ('public.docket_bill_obligation_checklist','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
 ('public.docket_bill_obligation_checklist','{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}'),
 ('public.v_civic_genome_prism_verification_status','{postgres=arwdDxtm/postgres,service_role=r/postgres}'))
 SELECT count(DISTINCT c.oid) INTO matched
 FROM approved_prior a JOIN pg_class c ON c.oid=to_regclass(a.name)
 WHERE c.relacl::text=a.acl;
 IF matched<>4 THEN RAISE EXCEPTION 'original structural view ACL differs'; END IF;

 -- Preserve original role boundary: anon/authenticated cannot read any of
 -- the four views, and Prism's verification view must have its exact
 -- service_role-only SELECT before the final cutoff. The three Docket views
 -- may have already lost service_role SELECT in the earlier safe replay.
 SELECT count(*) INTO matched
 FROM (VALUES
   ('public.docket_bill_drift_delta'),
   ('public.docket_bill_impact_callouts'),
   ('public.docket_bill_obligation_checklist'),
   ('public.v_civic_genome_prism_verification_status')) e(name)
 CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
 WHERE CASE WHEN r.role_name='service_role'
                 AND e.name <> 'public.v_civic_genome_prism_verification_status'
            THEN TRUE
            ELSE has_table_privilege(r.role_name,to_regclass(e.name),'SELECT')
                 IS NOT DISTINCT FROM (r.role_name='service_role')
       END;
 IF matched<>12 THEN RAISE EXCEPTION 'original structural view access differs'; END IF;
 -- In zero-state Supabase replay, migration statement packaging differs from
 -- the independently archived production receipt. Require the prior write
 -- quarantine migration ID; the 10 exact installed trigger hashes below remain
 -- compulsory before AND after this four-view permission cut.
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015135444'
 AND name='civic_genome_rosetta_sql_write_quarantine_v1') THEN RAISE EXCEPTION 'database write quarantine migration missing'; END IF;
 WITH expected(table_name,trigger_name,body_md5,enabled) AS(VALUES ('civic_genome_trait','zz_civic_genome_block_rosetta_trait_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_assembly_run','zz_civic_genome_block_rosetta_assembly_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_structural_representation','zz_civic_genome_block_rosetta_structural_representation_write_v','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_source_binding','zz_civic_genome_block_rosetta_source_binding_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_generation_target','zz_civic_genome_block_rosetta_target_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_bill','zz_civic_genome_block_bill_rosetta_payload_v1','ec8e3e387f823d806f926bd92585ec6e','O'),('civic_genome_bill_version','zz_civic_genome_block_bill_version_rosetta_receipt_v1','b29c9699c7831806f7ddcf346e309e22','O'),('civic_genome_projection_entity_version','zz_civic_genome_guard_source_only_history_v1','8c281d2d552148d50059c665e5f6aabf','O'),('civic_genome_rosetta_generation_activation_queue','zz_civic_genome_block_rosetta_activation_execution_v1','38c9a5480b91a640fe27776a7f0340bc','O'),('civic_genome_rosetta_generation_upgrade_queue','zz_civic_genome_block_rosetta_upgrade_execution_v1','38c9a5480b91a640fe27776a7f0340bc','O'))
 SELECT count(*) INTO matched FROM expected e JOIN pg_trigger t ON t.tgrelid=to_regclass(e.table_name) AND t.tgname=e.trigger_name WHERE NOT t.tgisinternal AND t.tgenabled::text=e.enabled AND md5(pg_get_functiondef(t.tgfoid))=e.body_md5;
 IF matched<>10 THEN RAISE EXCEPTION 'database write quarantine changed'; END IF;
 SELECT jsonb_build_object('traits',(SELECT count(*) FROM public.civic_genome_trait),'bills',(SELECT count(*) FROM public.civic_genome_bill),'versions',(SELECT count(*) FROM public.civic_genome_bill_version),'history',(SELECT count(*) FROM public.civic_genome_projection_entity_version)) INTO before_rows;
 REVOKE ALL PRIVILEGES ON TABLE public.docket_bill_drift_delta,public.docket_bill_impact_callouts,public.docket_bill_obligation_checklist,public.v_civic_genome_prism_verification_status FROM PUBLIC,anon,authenticated,service_role;
 WITH expected(name,definition_md5) AS(VALUES ('public.docket_bill_drift_delta','5cd3a477021b9794d0eaa46f7bc4b0e4'),('public.docket_bill_impact_callouts','e2b811f7140ee5f08fe20b517a14e334'),('public.docket_bill_obligation_checklist','2bd5ce9396cb757ccf8072377c73eb67'),('public.v_civic_genome_prism_verification_status','c0707929b3015ddcf537498ef01f01cb'))
 SELECT count(*) INTO matched FROM expected e JOIN pg_class c ON c.oid=to_regclass(e.name)
 WHERE c.relkind='v' AND pg_get_userbyid(c.relowner)='postgres' AND md5(pg_get_viewdef(c.oid,true))=e.definition_md5;
 IF matched<>4 THEN RAISE EXCEPTION 'structural view definition or ownership changed'; END IF;
 SELECT count(*) INTO matched FROM (VALUES ('public.docket_bill_drift_delta','5cd3a477021b9794d0eaa46f7bc4b0e4'),('public.docket_bill_impact_callouts','e2b811f7140ee5f08fe20b517a14e334'),('public.docket_bill_obligation_checklist','2bd5ce9396cb757ccf8072377c73eb67'),('public.v_civic_genome_prism_verification_status','c0707929b3015ddcf537498ef01f01cb'))e(name,definition_md5) CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))r(role_name) WHERE has_table_privilege(r.role_name,to_regclass(e.name),'SELECT');
 IF matched<>0 THEN RAISE EXCEPTION 'structural view application SELECT remains'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid IN ('public.docket_bill_drift_delta'::regclass,'public.docket_bill_impact_callouts'::regclass,'public.docket_bill_obligation_checklist'::regclass,'public.v_civic_genome_prism_verification_status'::regclass) AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'non-owner structural view privileges remain'; END IF;
 WITH expected(table_name,trigger_name,body_md5,enabled) AS(VALUES ('civic_genome_trait','zz_civic_genome_block_rosetta_trait_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_assembly_run','zz_civic_genome_block_rosetta_assembly_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_structural_representation','zz_civic_genome_block_rosetta_structural_representation_write_v','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_source_binding','zz_civic_genome_block_rosetta_source_binding_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_rosetta_generation_target','zz_civic_genome_block_rosetta_target_write_v1','87ffdb41a744456fb3863f2a0574b30c','O'),('civic_genome_bill','zz_civic_genome_block_bill_rosetta_payload_v1','ec8e3e387f823d806f926bd92585ec6e','O'),('civic_genome_bill_version','zz_civic_genome_block_bill_version_rosetta_receipt_v1','b29c9699c7831806f7ddcf346e309e22','O'),('civic_genome_projection_entity_version','zz_civic_genome_guard_source_only_history_v1','8c281d2d552148d50059c665e5f6aabf','O'),('civic_genome_rosetta_generation_activation_queue','zz_civic_genome_block_rosetta_activation_execution_v1','38c9a5480b91a640fe27776a7f0340bc','O'),('civic_genome_rosetta_generation_upgrade_queue','zz_civic_genome_block_rosetta_upgrade_execution_v1','38c9a5480b91a640fe27776a7f0340bc','O'))
 SELECT count(*) INTO matched FROM expected e JOIN pg_trigger t ON t.tgrelid=to_regclass(e.table_name) AND t.tgname=e.trigger_name WHERE NOT t.tgisinternal AND t.tgenabled::text=e.enabled AND md5(pg_get_functiondef(t.tgfoid))=e.body_md5;
 IF matched<>10 THEN RAISE EXCEPTION 'database write quarantine changed'; END IF;
 SELECT jsonb_build_object('traits',(SELECT count(*) FROM public.civic_genome_trait),'bills',(SELECT count(*) FROM public.civic_genome_bill),'versions',(SELECT count(*) FROM public.civic_genome_bill_version),'history',(SELECT count(*) FROM public.civic_genome_projection_entity_version)) INTO after_rows;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'view cut observed row conservation drift'; END IF;
END $view_cut$;
