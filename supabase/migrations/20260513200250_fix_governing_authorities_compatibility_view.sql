CREATE OR REPLACE VIEW public.governing_authorities AS
SELECT
  id,
  "statuteId",
  "sectionNumber" AS authority_reference,
  "sectionName" AS authority_name,
  authority AS authority_text,
  status,
  "createdAt",
  "updatedAt"
FROM public.legal_statute_clauses;

COMMENT ON VIEW public.governing_authorities IS
'Compatibility semantic overlay view. Non-destructive alias over legal_statute_clauses for gradual CDA domain-agnostic convergence.';
