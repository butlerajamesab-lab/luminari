-- Historical reconciliation record.
--
-- The original operational runtime projection migration assumed a complete
-- set of May 2026 summary views and legacy relation shapes. Production now
-- contains an evolved subset of those runtime projections, including
-- v_atlas_bridge_runtime, v_civic_map_runtime, v_civil_gideon_runtime, and
-- v_pattern_runtime.
--
-- Replaying the original bundle would fail on absent optional summary views
-- and obsolete bridge/resource columns. Existing production projections are
-- authoritative for this checkpoint.
--
-- No tables, views, columns, policies, or data are changed.

select 1
