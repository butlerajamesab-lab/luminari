-- Read-only acceptance checks for the governed Signal Architecture case-link receipt.

with checks as (
  select 'table_exists'::text as check_name,
         to_regclass('public.signal_artifact_case_links_v1') is not null as passed
  union all
  select 'row_level_security_enabled',
         coalesce((
           select c.relrowsecurity
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'signal_artifact_case_links_v1'
         ), false)
  union all
  select 'browser_roles_have_no_table_grants',
         not exists (
           select 1
             from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name = 'signal_artifact_case_links_v1'
              and grantee in ('PUBLIC', 'anon', 'authenticated')
         )
  union all
  select 'service_role_is_server_boundary',
         (
           select count(distinct privilege_type) = 2
             from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name = 'signal_artifact_case_links_v1'
              and grantee = 'service_role'
              and privilege_type in ('SELECT', 'INSERT')
         )
  union all
  select 'immutable_update_trigger_enabled',
         exists (
           select 1
             from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'signal_artifact_case_links_v1'
              and t.tgname = 'signal_artifact_case_links_immutable_v1'
              and not t.tgisinternal
              and t.tgenabled <> 'D'
         )
  union all
  select 'all_rows_have_exactly_one_artifact',
         not exists (
           select 1
             from public.signal_artifact_case_links_v1
            where num_nonnulls(
              intake_signal_id,
              legal_pattern_id,
              live_data_signal_id,
              convergence_id
            ) <> 1
         )
  union all
  select 'all_rows_match_declared_domain',
         not exists (
           select 1
             from public.signal_artifact_case_links_v1
            where not (
              (domain_code = 'case_intake' and intake_signal_id is not null)
              or (domain_code = 'legal_pattern' and legal_pattern_id is not null)
              or (domain_code = 'live_data' and live_data_signal_id is not null)
              or (domain_code = 'convergence' and convergence_id is not null)
            )
         )
)
select check_name, passed
  from checks
 order by check_name;
