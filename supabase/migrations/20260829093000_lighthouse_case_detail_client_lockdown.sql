-- Repository-only no-op receipt.
-- The canonical production migration is 20260829105026_lighthouse_case_detail_client_lockdown.sql and must execute exactly once.
-- This earlier version is retained only to preserve repository history without replaying the production change.

do $repository_only_duplicate_receipt$
begin
  raise notice 'Skipping duplicate repository migration; canonical receipt: 20260829105026_lighthouse_case_detail_client_lockdown.sql';
end
$repository_only_duplicate_receipt$;
