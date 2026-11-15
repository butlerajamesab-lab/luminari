-- Bundle decomposition: admit the judged shape in the ledger.
--
-- The wave-1 ledger (20261110240000) restricted
-- luminari_bundle_decompositions.shape to the two mechanical shapes
-- ('clean_split', 'shared_site_split') because wave 1 decomposed only
-- mechanical bundles. Wave 2 (the WA-217 split) and wave 3 decompose
-- bundles the census classified as 'needs_judgment' — bundles whose
-- variant pairs needed recorded human-reviewed decisions — and both
-- ledger builders insert the bundle's own shape. Without this change
-- every judged apply rolls back on
-- luminari_bundle_decompositions_shape_check (SQLSTATE 23514,
-- reproduced against production 2026-11-14).
--
-- The constraint is widened, not dropped: the three census shapes are
-- the complete shape domain.

alter table public.luminari_bundle_decompositions
  drop constraint luminari_bundle_decompositions_shape_check;

alter table public.luminari_bundle_decompositions
  add constraint luminari_bundle_decompositions_shape_check
  check (shape in ('clean_split', 'shared_site_split', 'needs_judgment'));
