revoke all on function public.rosetta_multi_law_proof_v1(integer, integer) from public

grant execute on function public.rosetta_multi_law_proof_v1(integer, integer) to anon, authenticated, service_role

comment on function public.rosetta_multi_law_proof_v1(integer, integer) is
  'Bounded read-only Rosetta Multi-Law Proof projection. Public read execution is permitted because it exposes only the same production proof surface as GET /api/proof; no mutation capability or raw canonical table grant is introduced.'

notify pgrst, 'reload schema'
