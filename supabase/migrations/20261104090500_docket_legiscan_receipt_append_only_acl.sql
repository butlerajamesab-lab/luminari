-- FORWARD-ONLY ACL CORRECTION after 20261104084300.
-- The first Docket receipt migration was already applied in disposable
-- Supabase Preview and its exact Git blob must not be rewritten.
-- Supabase default privileges can grant service_role TRUNCATE, which is
-- incompatible with immutable bill/source provenance.
-- This migration is still repository-only and not installed in production.
do $preflight$
begin
  if to_regclass('public.docket_legiscan_bulk_member_receipt') is null then
    raise exception 'docket_bulk_receipt_schema_missing_before_acl_hardening';
  end if;
  if md5(pg_get_functiondef('public.enqueue_docket_current_authoritative_version_v1()'::regprocedure))
     is distinct from '4315a2fc6e7fe6cb75bd34aeb53ec614' then
    raise exception 'docket_bulk_source_gate_changed_before_acl_hardening';
  end if;
end
$preflight$;

revoke all on public.docket_legiscan_bulk_member_receipt from service_role;
grant select, insert on public.docket_legiscan_bulk_member_receipt to service_role;

do $postflight$
begin
  if not exists (
    select 1 from pg_class
    where oid='public.docket_legiscan_bulk_member_receipt'::regclass
      and relrowsecurity
  ) then raise exception 'docket_bulk_receipts_rls_not_enabled'; end if;
  if not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','select')
     or not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','insert')
     or has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','update')
     or has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','delete')
     or has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','truncate')
     or has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','references')
     or has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','trigger')
  then raise exception 'docket_bulk_receipts_service_role_append_only_acl_regression'; end if;
  if has_table_privilege('anon','public.docket_legiscan_bulk_member_receipt','select')
     or has_table_privilege('authenticated','public.docket_legiscan_bulk_member_receipt','select')
     or has_table_privilege('anon','public.docket_legiscan_bulk_member_receipt','insert')
     or has_table_privilege('authenticated','public.docket_legiscan_bulk_member_receipt','insert')
  then raise exception 'docket_bulk_receipts_public_acl_regression'; end if;
end
$postflight$;
