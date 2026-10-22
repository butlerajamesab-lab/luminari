-- Bounded original-grant restoration only; never a runtime fallback.
DO $view_rollback$
DECLARE matched integer;
BEGIN
 WITH expected(name,definition_md5) AS(VALUES ('public.docket_bill_drift_delta','5cd3a477021b9794d0eaa46f7bc4b0e4'),('public.docket_bill_impact_callouts','e2b811f7140ee5f08fe20b517a14e334'),('public.docket_bill_obligation_checklist','2bd5ce9396cb757ccf8072377c73eb67'),('public.v_civic_genome_prism_verification_status','c0707929b3015ddcf537498ef01f01cb'))
 SELECT count(*) INTO matched FROM expected e JOIN pg_class c ON c.oid=to_regclass(e.name)
 WHERE c.relkind='v' AND pg_get_userbyid(c.relowner)='postgres' AND md5(pg_get_viewdef(c.oid,true))=e.definition_md5;
 IF matched<>4 THEN RAISE EXCEPTION 'structural view definition or ownership changed'; END IF;
 SELECT count(*) INTO matched FROM (VALUES ('public.docket_bill_drift_delta','5cd3a477021b9794d0eaa46f7bc4b0e4'),('public.docket_bill_impact_callouts','e2b811f7140ee5f08fe20b517a14e334'),('public.docket_bill_obligation_checklist','2bd5ce9396cb757ccf8072377c73eb67'),('public.v_civic_genome_prism_verification_status','c0707929b3015ddcf537498ef01f01cb'))e(name,definition_md5) CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))r(role_name) WHERE has_table_privilege(r.role_name,to_regclass(e.name),'SELECT');
 IF matched<>0 THEN RAISE EXCEPTION 'retired structural view SELECT state changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid IN ('public.docket_bill_drift_delta'::regclass,'public.docket_bill_impact_callouts'::regclass,'public.docket_bill_obligation_checklist'::regclass,'public.v_civic_genome_prism_verification_status'::regclass) AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'non-owner structural view privileges changed'; END IF;
 GRANT ALL PRIVILEGES ON TABLE public.docket_bill_drift_delta,public.docket_bill_impact_callouts,public.docket_bill_obligation_checklist TO service_role;
 GRANT SELECT ON TABLE public.v_civic_genome_prism_verification_status TO service_role;
 WITH original(name,acl) AS(VALUES ('public.docket_bill_drift_delta','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),('public.docket_bill_impact_callouts','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),('public.docket_bill_obligation_checklist','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),('public.v_civic_genome_prism_verification_status','{postgres=arwdDxtm/postgres,service_role=r/postgres}')) SELECT count(*) INTO matched FROM original o JOIN pg_class c ON c.oid=to_regclass(o.name) WHERE c.relacl::text=o.acl;
 IF matched<>4 THEN RAISE EXCEPTION 'exact prior structural view ACL not restored'; END IF;
END $view_rollback$;
