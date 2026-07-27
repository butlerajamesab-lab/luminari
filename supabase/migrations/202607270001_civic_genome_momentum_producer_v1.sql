-- Civic Genome momentum producer v1
--
-- Governs the two derived momentum fields that were previously written as zero:
--   * civic_genome_family.acceleration_score
--   * family_momentum_snapshot.new_state_count / acceleration_score
--
-- The producer uses the nearest family snapshot at least seven calendar days
-- before the measured date. It does not mutate bill, event, family identity, or
-- provenance records. Existing derived fields are deterministically recomputed.

create or replace function public.compute_civic_genome_momentum_v1(
  p_family_id uuid,
  p_active_state_count integer,
  p_as_of_date date default current_date
)
returns table (
  prior_active_state_count integer,
  new_state_count integer,
  acceleration_score numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    prior.prior_active_state_count,
    case
      when prior.prior_active_state_count is null then 0
      else greatest(p_active_state_count - prior.prior_active_state_count, 0)
    end::integer as new_state_count,
    case
      when prior.prior_active_state_count is null then 0::numeric
      else least(
        1::numeric,
        greatest(
          0::numeric,
          (p_active_state_count - prior.prior_active_state_count)::numeric / 10::numeric
        )
      )
    end as acceleration_score
  from (
    select (
      select snapshot.active_state_count
      from public.family_momentum_snapshot snapshot
      where snapshot.family_id = p_family_id
        and snapshot.snapshot_date <= p_as_of_date - 7
      order by snapshot.snapshot_date desc
      limit 1
    ) as prior_active_state_count
  ) prior;
$$;

comment on function public.compute_civic_genome_momentum_v1(uuid, integer, date) is
  'Deterministically computes nonnegative seven-day active-state growth and a bounded 0..1 acceleration score from the nearest qualifying family snapshot.';

create or replace function public.set_civic_genome_family_momentum_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  computed record;
begin
  select *
  into computed
  from public.compute_civic_genome_momentum_v1(
    new.family_id,
    new.active_state_count,
    current_date
  );

  new.acceleration_score := coalesce(computed.acceleration_score, 0);
  return new;
end;
$$;

comment on function public.set_civic_genome_family_momentum_v1() is
  'Enforces the canonical Civic Genome family acceleration value whenever active-state momentum is persisted.';

drop trigger if exists civic_genome_family_momentum_v1
  on public.civic_genome_family;

create trigger civic_genome_family_momentum_v1
before insert or update of active_state_count, acceleration_score
on public.civic_genome_family
for each row
execute function public.set_civic_genome_family_momentum_v1();

create or replace function public.set_family_momentum_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  computed record;
begin
  select *
  into computed
  from public.compute_civic_genome_momentum_v1(
    new.family_id,
    new.active_state_count,
    new.snapshot_date
  );

  new.new_state_count := coalesce(computed.new_state_count, 0);
  new.acceleration_score := coalesce(computed.acceleration_score, 0);
  return new;
end;
$$;

comment on function public.set_family_momentum_snapshot_v1() is
  'Enforces canonical new-state and acceleration values on each dated Civic Genome momentum snapshot.';

drop trigger if exists family_momentum_snapshot_v1
  on public.family_momentum_snapshot;

create trigger family_momentum_snapshot_v1
before insert or update of family_id, snapshot_date, active_state_count, new_state_count, acceleration_score
on public.family_momentum_snapshot
for each row
execute function public.set_family_momentum_snapshot_v1();

-- Recompute existing derived snapshot values without altering source bill or
-- family identity records. The trigger derives values from persisted history.
update public.family_momentum_snapshot
set active_state_count = active_state_count;

-- Recompute the current family projection after historical snapshots are fixed.
update public.civic_genome_family
set active_state_count = active_state_count;

revoke all on function public.compute_civic_genome_momentum_v1(uuid, integer, date)
  from public, anon, authenticated;
revoke all on function public.set_civic_genome_family_momentum_v1()
  from public, anon, authenticated;
revoke all on function public.set_family_momentum_snapshot_v1()
  from public, anon, authenticated;

grant execute on function public.compute_civic_genome_momentum_v1(uuid, integer, date)
  to service_role;
grant execute on function public.set_civic_genome_family_momentum_v1()
  to service_role;
grant execute on function public.set_family_momentum_snapshot_v1()
  to service_role;
