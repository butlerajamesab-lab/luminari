-- Repository-only no-op receipt.
-- The canonical production migration is 20260820155755_civic_genome_prism_rosetta_stale_context_supersession_v1.sql and must execute exactly once.
-- This earlier version is retained only to preserve repository history without replaying the production change.

do $repository_only_duplicate_receipt$
begin
  raise notice 'Skipping duplicate repository migration; canonical receipt: 20260820155755_civic_genome_prism_rosetta_stale_context_supersession_v1.sql';
end
$repository_only_duplicate_receipt$;
