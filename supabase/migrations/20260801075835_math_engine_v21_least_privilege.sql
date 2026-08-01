-- Remove legacy mutation privileges from append-only governed math tables.
revoke update, delete, truncate, references, trigger on
  public.geography_registry,
  public.convergence_receipts,
  public.convergence_run_snapshot,
  public.claim_definitions,
  public.case_evidence,
  public.case_viability_context,
  public.claim_element_evaluations,
  public.priority_utility_snapshot
from service_role;

grant select, insert on
  public.geography_registry,
  public.convergence_receipts,
  public.convergence_run_snapshot,
  public.claim_definitions,
  public.case_evidence,
  public.case_viability_context,
  public.claim_element_evaluations,
  public.priority_utility_snapshot
to service_role;
