-- Repository-only no-op receipt.
-- The canonical production migration is 20260822080502_atlas_domain3_integrity_review_projection_verify.sql and must execute exactly once.
-- This earlier version is retained only to preserve repository history without replaying the production change.

do $repository_only_duplicate_receipt$
begin
  raise notice 'Skipping duplicate repository migration; canonical receipt: 20260822080502_atlas_domain3_integrity_review_projection_verify.sql';
end
$repository_only_duplicate_receipt$;
