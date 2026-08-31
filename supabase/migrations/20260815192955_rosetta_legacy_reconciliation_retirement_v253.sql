begin

drop function if exists public.rosetta_reconcile_structural_correctness(integer)

comment on table public.rosetta_clause_occurrence is 'Rosetta 2.5.3 node-aware accountability occurrence ledger. Legacy unversioned reconciliation has been retired; active decomposition uses rosetta_v253_reconcile_structural_correctness.'

commit
