create or replace function rosetta_private.rosetta_run_proof_membership_v1(
  p_run_ids integer[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  with requested as (
    select distinct run_id
    from unnest(coalesce(p_run_ids, array[]::integer[])) as requested(run_id)
    where run_id is not null and run_id > 0
  )
  select jsonb_build_object(
    'contract', 'rosetta-run-proof-membership-v1',
    'current_proof_run_ids', coalesce(
      jsonb_agg(requested.run_id order by requested.run_id)
        filter (where rosetta_private.rosetta_is_current_proof_run_v1(requested.run_id)),
      '[]'::jsonb
    )
  )
  from requested;
$$

revoke all on function rosetta_private.rosetta_run_proof_membership_v1(integer[]) from public

grant execute on function rosetta_private.rosetta_run_proof_membership_v1(integer[])
  to anon, authenticated, service_role

create or replace function public.rosetta_run_proof_membership_v1(
  p_run_ids integer[]
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, rosetta_private
as $$
  select rosetta_private.rosetta_run_proof_membership_v1(p_run_ids);
$$

revoke all on function public.rosetta_run_proof_membership_v1(integer[]) from public

grant execute on function public.rosetta_run_proof_membership_v1(integer[])
  to anon, authenticated, service_role

comment on function public.rosetta_run_proof_membership_v1(integer[]) is
  'Bounded proof-membership read for explicitly requested run ids. Uses the same centralized current-proof predicate as Dashboard and Multi-Law Proof.'
