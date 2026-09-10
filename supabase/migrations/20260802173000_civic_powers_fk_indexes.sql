-- Civic Powers foreign-key index completion.
-- Additive, data-neutral, and required before canonical population.

begin;

create index if not exists civic_power_actor_parent_actor_id_idx
  on public.civic_power_actor(parent_actor_id);
create index if not exists civic_power_actor_supersedes_actor_id_idx
  on public.civic_power_actor(supersedes_actor_id);
create index if not exists civic_power_source_issuing_actor_id_idx
  on public.civic_power_source(issuing_actor_id);
create index if not exists civic_power_interpretation_supersedes_id_idx
  on public.civic_power_interpretation(supersedes_interpretation_id);
create index if not exists civic_power_interpretation_clause_clause_id_idx
  on public.civic_power_interpretation_clause(clause_id);
create index if not exists civic_power_interpretation_source_source_id_idx
  on public.civic_power_interpretation_source(source_id);
create index if not exists civic_power_edge_supersedes_edge_id_idx
  on public.civic_power_edge(supersedes_edge_id);
create index if not exists civic_power_edge_source_source_id_idx
  on public.civic_power_edge_source(source_id);
create index if not exists civic_power_application_instrument_source_id_idx
  on public.civic_power_application(instrument_source_id);
create index if not exists civic_power_application_supersedes_id_idx
  on public.civic_power_application(supersedes_application_id);
create index if not exists civic_power_application_source_source_id_idx
  on public.civic_power_application_source(source_id);
create index if not exists civic_power_status_receipt_source_source_id_idx
  on public.civic_power_status_receipt_source(source_id);
create index if not exists civic_power_application_edge_source_source_id_idx
  on public.civic_power_application_edge_source(source_id);

commit;
